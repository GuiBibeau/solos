// @ts-check
/**
 * The deposit half of the executor: turn one `add_liquidity` action into exactly one signed
 * v1 transaction — or a typed failure, before anything is signed. The plan (guards, fetch
 * orchestration, budget-fit liquidity, derivations) is pure over its reader seam; this
 * module binds the reader to real RPC, enforces the balance pre-check, and assembles the
 * transaction under the local v1 policy. A failed plan is a `BuildRejected`: the intent
 * never becomes bytes, and the caller's funds stay put.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTokenDecoder } from "@solana-program/token";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, holdsPositionNft } from "../liquidity/liquidity-accounts.js";
import {
  DEPOSIT_V1_CONFIG,
  increaseLiquidityInstruction,
} from "../liquidity/whirlpool-deposit-instruction.js";
import { depositPlan } from "../liquidity/whirlpool-deposit-plan.js";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { beginV1Message, signV1Message } from "./transaction-v1.js";

const EXECUTOR = "direct-signer";
const tokenDecoder = getTokenDecoder();

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos/actions").AddLiquidityAction} AddLiquidityAction */
/** @typedef {import("./swap-sol.js").Signed} Signed */
/** @typedef {{ readonly signed: Signed; readonly plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk }} PlannedDeposit */

/**
 * Fetch the three funding token accounts and prove each exists with enough of the token.
 * @param {{ rpc: Rpc["rpc"]; origin: string; timeoutMs: number }} read
 * @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
 */
const proofBalances = (read, plan) =>
  Effect.flatMap(
    fetchAccounts(read, [
      plan.accounts.positionTokenAccount,
      plan.accounts.tokenOwnerAccountA,
      plan.accounts.tokenOwnerAccountB,
    ]),
    ([nft, a, b]) => {
      if (nft === null) return fail("the position NFT token account is missing");
      const aShort = balanceShort(a, plan.requiredA);
      if (aShort !== null) return fail(`insufficient token A balance: ${aShort}`);
      const bShort = balanceShort(b, plan.requiredB);
      if (bShort !== null) return fail(`insufficient token B balance: ${bShort}`);
      return Effect.succeed(undefined);
    },
  );

/** @param {import("../liquidity/liquidity-accounts.js").FetchedAccount | null | undefined} row @param {bigint} required @returns {string | null} a shortfall reason, or null when the balance covers the spend */
const balanceShort = (row, required) => {
  if (row === null || row === undefined) {
    return "the funding account is missing; no deposit is possible";
  }
  const amount = tokenDecoder.decode(row.bytes).amount;
  return amount < required ? `${amount} available, the deposit needs ${required}` : null;
};

/** @param {string} reason @returns {import("effect").Effect.Effect<never, BuildRejected>} */
const fail = (reason) => Effect.fail(new BuildRejected({ reason }));

/**
 * Run the plan against real RPC; its typed rejects surface as values the caller maps to
 * `BuildRejected`, and the reads keep their own `RpcError` channel.
 * @param {Rpc} ctx @param {string} owner @param {AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<import("../liquidity/whirlpool-deposit-plan.js").DepositPlan, import("@solos/core").RpcError>}
 */
const planFromChain = (ctx, owner, action) => {
  const read = { rpc: ctx.rpc, origin: rpcOrigin(ctx.url), timeoutMs: TOKEN_RPC_TIMEOUT_MS };
  /** @type {import("../liquidity/whirlpool-deposit-plan.js").DepositReader} */
  const reader = {
    rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(read, accounts),
    custody: (/** @type {string} */ positionMint) => holdsPositionNft(read, owner, positionMint),
  };
  return depositPlan({
    reader,
    action: {
      pool: action.pool,
      position: action.position,
      amountA: BigInt(action.amountA),
      amountB: BigInt(action.amountB),
    },
    owner,
  });
};

/**
 * Assemble and sign the deposit under the local v1 policy: a fresh blockhash lifetime and
 * exactly one `increase_liquidity` instruction. Nothing here can send anything.
 * @param {Rpc} ctx @param {Kit} kit @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
 * @returns {import("effect").Effect.Effect<Signed, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
const signDeposit = (ctx, kit, plan) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: DEPOSIT_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(
            [
              increaseLiquidityInstruction(plan.accounts, {
                liquidity: plan.liquidity,
                tokenMaxA: plan.tokenMaxA,
                tokenMaxB: plan.tokenMaxB,
              }),
            ],
            message,
          ),
        ),
      catch: (/** @type {unknown} */ error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({
              reason: "transaction failed v1 policy before signing; nothing was signed",
            }),
    });
  });

/**
 * Build and sign one deposit. Refuses anything but an Orca position before any RPC.
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<PlannedDeposit, import("@solos/core").ExecutorError>}
 */
export const buildSignedLiquidityDeposit = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "orca") {
      return yield* new UnsupportedAction({
        actionType: `add_liquidity:${action.protocol}`,
        executor: EXECUTOR,
      });
    }
    const plan = yield* planFromChain(ctx, kit.signer.address, action);
    if (plan.status === "reject") {
      return yield* new BuildRejected({ reason: plan.reason });
    }
    const read = { rpc: ctx.rpc, origin: rpcOrigin(ctx.url), timeoutMs: TOKEN_RPC_TIMEOUT_MS };
    yield* proofBalances(read, plan);
    const signed = yield* signDeposit(ctx, kit, plan);
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityDeposit"));
