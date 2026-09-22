// @ts-check
/**
 * The deposit half of the executor: turn one `add_liquidity` action into exactly one signed
 * v1 transaction — or a typed failure, before anything is signed. The plan (guards, fetch
 * orchestration, budget-fit liquidity, derivations) is pure over its reader seam; this
 * module binds the reader to real RPC, proves the funding accounts (creating a missing
 * owner ATA idempotently when the quoted spend on that side is zero), and assembles the
 * transaction under the local v1 policy. A failed plan is a `BuildRejected`: the intent
 * never becomes bytes, and the caller's funds stay put.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import {
  getCreateAssociatedTokenIdempotentInstruction,
  getTokenDecoder,
} from "@solana-program/token";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
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
/** @typedef {Awaited<ReturnType<typeof signV1Message>>} Signed */
/** @typedef {Parameters<typeof appendTransactionMessageInstructions>[0][number]} SetupInstruction */
/** @typedef {{ readonly signed: Signed; readonly plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk }} PlannedDeposit */

/**
 * Fetch the two funding token accounts. A missing side is allowed only when the quote needs
 * nothing from it: the driver then prepends an idempotent ATA create so the instruction's
 * account exists — rent is the signer's. A present-but-short side is a typed rejection.
 * @param {{ rpc: Rpc["rpc"]; origin: string; timeoutMs: number }} read
 * @param {Kit} kit
 * @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
 * @returns {import("effect").Effect.Effect<SetupInstruction[], BuildRejected | import("@solos/core").RpcError>}
 */
const fundingSetup = (read, kit, plan) =>
  Effect.flatMap(
    fetchAccounts(read, [plan.accounts.tokenOwnerAccountA, plan.accounts.tokenOwnerAccountB]),
    ([a, b]) =>
      Effect.gen(function* () {
        const aSetup = yield* fundingSide(kit, {
          row: a,
          required: plan.requiredA,
          label: "A",
          mint: plan.mintA,
          plan,
        });
        const bSetup = yield* fundingSide(kit, {
          row: b,
          required: plan.requiredB,
          label: "B",
          mint: plan.mintB,
          plan,
        });
        return [aSetup, bSetup].filter((setup) => setup !== null);
      }),
  );

/**
 * One funding side: null when nothing is needed, an idempotent ATA create when the account
 * is absent and the quote needs nothing from it, a typed failure when it is short.
 * @param {Kit} kit
 * @param {{
 *   row: import("../liquidity/liquidity-accounts.js").FetchedAccount | null | undefined;
 *   required: bigint;
 *   label: string;
 *   mint: string;
 *   plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk;
 * }} parts
 * @returns {import("effect").Effect.Effect<SetupInstruction | null, BuildRejected>}
 */
const fundingSide = (kit, { row, required, label, mint, plan }) => {
  const isAbsent = row === null || row === undefined;
  if (!isAbsent) {
    const amount = tokenDecoder.decode(row.bytes).amount;
    if (amount >= required) return Effect.succeed(null);
  }
  if (required > 0n) {
    const detail = isAbsent
      ? "the funding account does not exist"
      : `${tokenDecoder.decode(row.bytes).amount} available, the deposit needs ${required}`;
    return fail(`insufficient token ${label} balance: ${detail}`);
  }
  const target =
    label === "A" ? plan.accounts.tokenOwnerAccountA : plan.accounts.tokenOwnerAccountB;
  return Effect.succeed(createAta(kit, mint, target));
};

/** @param {Kit} kit @param {string} mint @param {string} ata */
const createAta = (kit, mint, ata) =>
  getCreateAssociatedTokenIdempotentInstruction({
    payer: kit.signer,
    ata: /** @type {import("@solana/kit").Address} */ (/** @type {unknown} */ (ata)),
    owner: /** @type {import("@solana/kit").Address} */ (
      /** @type {unknown} */ (kit.signer.address)
    ),
    mint: /** @type {import("@solana/kit").Address} */ (/** @type {unknown} */ (mint)),
  });

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
    custody: (/** @type {string} */ positionMint) => positionNftAccount(read, owner, positionMint),
  };
  return depositPlan({
    reader,
    action: {
      pool: action.pool,
      position: action.position,
      amountA: BigInt(action.amountA),
      amountB: BigInt(action.amountB),
      maxSlippageBps: action.maxSlippageBps,
    },
    owner,
  });
};

/**
 * Assemble and sign the deposit under the local v1 policy: a fresh blockhash lifetime, any
 * idempotent ATA creates the funding proof demanded, then exactly one `increase_liquidity`.
 * Nothing here can send anything.
 * @param {{
 *   ctx: Rpc;
 *   kit: Kit;
 *   plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk;
 *   creates: SetupInstruction[];
 * }} parts
 * @returns {import("effect").Effect.Effect<Signed, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
const signDeposit = ({ ctx, kit, plan, creates }) =>
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
              ...creates,
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
 * The plan's quote as the published venueQuote value: exact amounts and encoded bounds,
 * decimal strings, at the pre-send pool price.
 * @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
 * @returns {import("@solos/actions").LiquidityDepositQuote}
 */
export const depositQuoteOf = (plan) => ({
  kind: "deposit",
  liquidity: String(plan.liquidity),
  requiredA: String(plan.requiredA),
  requiredB: String(plan.requiredB),
  tokenMaxA: String(plan.tokenMaxA),
  tokenMaxB: String(plan.tokenMaxB),
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
    const creates = yield* fundingSetup(read, kit, plan);
    const signed = yield* signDeposit({ ctx, kit, plan, creates });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityDeposit"));
