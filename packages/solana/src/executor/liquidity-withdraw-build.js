// @ts-check
/**
 * The withdraw half of the executor: turn one `remove_liquidity` action into exactly one
 * draft for Submission to seal (ADR-0032), or a typed failure before anything is signed.
 * Orca is planned here; Raydium and Meteora have their own builders. The plan (guards, fetch
 * orchestration, bps fraction, slippage-bounded minimums, derivations) is pure over its reader
 * seam; this module binds the reader to real RPC, proves the receiving token accounts
 * (creating a missing owner ATA idempotently when the position owes that side nothing at the
 * current price — its rent is a protocol-mandated transfer, distinct from removed principal),
 * and orders the draft's instructions. A failed plan is a `BuildRejected`: the intent never
 * becomes bytes, and the position's liquidity stays put. The position account is never
 * closed. Orca and Raydium keep the position NFT; Meteora has none.
 */
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  WHIRLPOOL_V1_CONFIG,
  decreaseLiquidityInstruction,
} from "../liquidity/whirlpool-withdraw-instruction.js";
import { withdrawPlan } from "../liquidity/whirlpool-withdraw-plan.js";
import { liquidityRead, receivingSide, setupSides } from "./liquidity-token-accounts.js";
import { draftMeteoraWithdraw } from "./meteora-withdraw-build.js";
import { draftRaydiumWithdraw } from "./raydium-liquidity-build.js";

const EXECUTOR = "direct-signer";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos-sh/actions").RemoveLiquidityAction} RemoveLiquidityAction */
/** @typedef {import("../submission/seal-draft.js").Draft} Draft */
/** @typedef {Draft["instructions"][number]} SetupInstruction */
/**
 * What a planned withdrawal carries, narrowed to the fields `withdrawQuoteOf` consumes so both
 * venues satisfy it.
 * @typedef {{ readonly liquidity: bigint; readonly estA: bigint; readonly estB: bigint;
 *   readonly minA: bigint; readonly minB: bigint }} WithdrawQuoteSource
 */
/** @typedef {{ readonly draft: Draft; readonly plan: WithdrawQuoteSource }} PlannedWithdraw */

/**
 * Prove each receiving side. A present account needs nothing. An absent side is allowed only
 * when the quote owes it nothing at the current price — the driver then prepends an idempotent
 * ATA create, whose rent is the signer's. An absent side that IS owed tokens fails: a payout
 * into a nonexistent account cannot be simulated honestly.
 * @param {ReturnType<typeof liquidityRead>} read
 * @param {Kit} kit
 * @param {import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk} plan
 */
const receiptSetup = (read, kit, plan) =>
  setupSides(read, plan.accounts, ({ row, label }) =>
    receivingSide({
      kit,
      row,
      label,
      owed: label === "A" ? plan.minA : plan.minB,
      mint: label === "A" ? plan.mintA : plan.mintB,
      ata: label === "A" ? plan.accounts.tokenOwnerAccountA : plan.accounts.tokenOwnerAccountB,
    }),
  );

/**
 * Run the plan against real RPC; its typed rejects surface as values the caller maps to
 * `BuildRejected`, and the reads keep their own `RpcError` channel.
 * @param {Rpc} ctx @param {string} owner @param {RemoveLiquidityAction} action
 * @returns {import("effect").Effect.Effect<import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlan, import("@solos/core").RpcError>}
 */
const planFromChain = (ctx, owner, action) => {
  const read = liquidityRead(ctx);
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
 * The removal's draft: any idempotent ATA creates the receipt proof demanded, then exactly one
 * `decrease_liquidity`. Submission seals it; nothing here signs.
 * @param {{
 *   plan: import("../liquidity/whirlpool-withdraw-plan.js").WithdrawPlanOk;
 *   creates: SetupInstruction[];
 * }} parts
 * @returns {Draft}
 */
const withdrawDraft = ({ plan, creates }) => ({
  label: "Orca withdraw",
  instructions: [
    ...creates,
    decreaseLiquidityInstruction(plan.accounts, {
      liquidity: plan.liquidity,
      tokenMinA: plan.minA,
      tokenMinB: plan.minB,
    }),
  ],
  config: WHIRLPOOL_V1_CONFIG,
});

/**
 * The plan's quote as the published venueQuote value: exact amounts and encoded bounds,
 * decimal strings, at the pre-send pool price.
 * @param {WithdrawQuoteSource} plan
 * @returns {import("@solos-sh/actions").LiquidityRemovalQuote}
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
 * Draft one removal. Orca is assembled here. Raydium and Meteora dispatch to
 * their own builders. Any other protocol is refused before RPC.
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {RemoveLiquidityAction} action
 * @returns {import("effect").Effect.Effect<PlannedWithdraw, import("@solos/core").ExecutorError>}
 */
export const draftLiquidityWithdraw = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol === "raydium") {
      return yield* draftRaydiumWithdraw({ ctx, kit }, action);
    }
    if (action.protocol === "meteora") {
      return yield* draftMeteoraWithdraw({ ctx, kit }, action);
    }
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
    const read = liquidityRead(ctx);
    const creates = yield* receiptSetup(read, kit, plan);
    return { draft: withdrawDraft({ plan, creates }), plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityWithdraw"));
