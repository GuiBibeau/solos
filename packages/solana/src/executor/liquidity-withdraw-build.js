// @ts-check
/**
 * The withdraw half of the executor: turn one `remove_liquidity` action into exactly one
 * signed v1 transaction — or a typed failure, before anything is signed. The plan (guards,
 * fetch orchestration, bps fraction, slippage-bounded minimums, derivations) is pure over
 * its reader seam; this module binds the reader to real RPC, proves the receiving token
 * accounts (creating a missing owner ATA idempotently when the position owes that side
 * nothing at the current price — its rent is a protocol-mandated transfer, distinct from
 * removed principal), and assembles the transaction under the local v1 policy. A failed
 * plan is a `BuildRejected`: the intent never becomes bytes, and the position's liquidity
 * stays put. The position account and its NFT are never touched by a close or burn.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  WHIRLPOOL_V1_CONFIG,
  decreaseLiquidityInstruction,
} from "../liquidity/whirlpool-withdraw-instruction.js";
import { withdrawPlan } from "../liquidity/whirlpool-withdraw-plan.js";
import { TOKEN_RPC_TIMEOUT_MS } from "../market/account-read.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { beginV1Message, signV1Message } from "./transaction-v1.js";

const EXECUTOR = "direct-signer";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos/actions").RemoveLiquidityAction} RemoveLiquidityAction */
/** @typedef {Awaited<ReturnType<typeof signV1Message>>} Signed */
/** @typedef {Parameters<typeof appendTransactionMessageInstructions>[0][number]} SetupInstruction */
/** @typedef {{ readonly signed: Signed; readonly plan: import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk }} PlannedWithdraw */

/**
 * Prove the two receiving token accounts. A present account needs nothing. An absent side
 * is allowed only when the quote owes it nothing (zero minimum at the current price): the
 * driver then prepends an idempotent ATA create so the instruction's account exists — its
 * rent is the signer's, a protocol-mandated cost booked separately from principal. An
 * absent side that IS owed tokens fails: a payout into a nonexistent account cannot be
 * simulated honestly.
 * @param {{ rpc: Rpc["rpc"]; origin: string; timeoutMs: number }} read
 * @param {Kit} kit
 * @param {import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk} plan
 * @returns {import("effect").Effect.Effect<SetupInstruction[], BuildRejected | import("@solos/core").RpcError>}
 */
const receiptSetup = (read, kit, plan) =>
  Effect.flatMap(
    fetchAccounts(read, [plan.accounts.tokenOwnerAccountA, plan.accounts.tokenOwnerAccountB]),
    ([a, b]) =>
      Effect.gen(function* () {
        const aSetup = yield* receiptSide(kit, {
          row: a,
          minimum: plan.minA,
          label: "A",
          mint: plan.mintA,
          target: plan.accounts.tokenOwnerAccountA,
        });
        const bSetup = yield* receiptSide(kit, {
          row: b,
          minimum: plan.minB,
          label: "B",
          mint: plan.mintB,
          target: plan.accounts.tokenOwnerAccountB,
        });
        return [aSetup, bSetup].filter((setup) => setup !== null);
      }),
  );

/**
 * One receiving side: null when nothing is needed, an idempotent ATA create when the
 * account is absent and the quote owes it nothing, a typed failure when it is absent and
 * owed tokens.
 * @param {Kit} kit
 * @param {{
 *   row: import("../liquidity/liquidity-accounts.js").FetchedAccount | null | undefined;
 *   minimum: bigint;
 *   label: string;
 *   mint: string;
 *   target: string;
 * }} parts
 * @returns {import("effect").Effect.Effect<SetupInstruction | null, BuildRejected>}
 */
const receiptSide = (kit, { row, minimum, label, mint, target }) => {
  const isAbsent = row === null || row === undefined;
  if (!isAbsent) return Effect.succeed(null);
  if (minimum > 0n) {
    return fail(
      `the token ${label} receiving account does not exist and the position owes it ` +
        `${minimum} base units at the current price`,
    );
  }
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
 * @param {Rpc} ctx @param {string} owner @param {RemoveLiquidityAction} action
 * @returns {import("effect").Effect.Effect<import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlan, import("@solos/core").RpcError>}
 */
const planFromChain = (ctx, owner, action) => {
  const read = { rpc: ctx.rpc, origin: rpcOrigin(ctx.url), timeoutMs: TOKEN_RPC_TIMEOUT_MS };
  /** @type {import("../liquidity/whirlpool-withdraw-plan.js").WithdrawReader} */
  const reader = {
    rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(read, accounts),
    custody: (/** @type {string} */ positionMint) => positionNftAccount(read, owner, positionMint),
  };
  return withdrawPlan({
    reader,
    action: {
      position: action.position,
      bps: action.bps,
      maxSlippageBps: action.maxSlippageBps,
    },
    owner,
  });
};

/**
 * Assemble and sign the removal under the local v1 policy: a fresh blockhash lifetime, any
 * idempotent ATA creates the receipt proof demanded, then exactly one
 * `decrease_liquidity`. Nothing here can send anything.
 * @param {{
 *   ctx: Rpc;
 *   kit: Kit;
 *   plan: import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk;
 *   creates: SetupInstruction[];
 * }} parts
 * @returns {import("effect").Effect.Effect<Signed, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
const signWithdraw = ({ ctx, kit, plan, creates }) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: WHIRLPOOL_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(
            [
              ...creates,
              decreaseLiquidityInstruction(plan.accounts, {
                liquidity: plan.liquidity,
                tokenMinA: plan.minA,
                tokenMinB: plan.minB,
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
 * @param {import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk} plan
 * @returns {import("@solos/actions").LiquidityRemovalQuote}
 */
export const withdrawQuoteOf = (plan) => ({
  kind: "removal",
  liquidity: String(plan.liquidity),
  estA: String(plan.estA),
  estB: String(plan.estB),
  minA: String(plan.minA),
  minB: String(plan.minB),
});

/**
 * Build and sign one removal. Refuses anything but an Orca position before any RPC.
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {RemoveLiquidityAction} action
 * @returns {import("effect").Effect.Effect<PlannedWithdraw, import("@solos/core").ExecutorError>}
 */
export const buildSignedLiquidityWithdraw = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol !== "orca") {
      return yield* new UnsupportedAction({
        actionType: `remove_liquidity:${action.protocol}`,
        executor: EXECUTOR,
      });
    }
    const plan = yield* planFromChain(ctx, kit.signer.address, action);
    if (plan.status === "reject") {
      return yield* new BuildRejected({ reason: plan.reason });
    }
    const read = { rpc: ctx.rpc, origin: rpcOrigin(ctx.url), timeoutMs: TOKEN_RPC_TIMEOUT_MS };
    const creates = yield* receiptSetup(read, kit, plan);
    const signed = yield* signWithdraw({ ctx, kit, plan, creates });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityWithdraw"));
