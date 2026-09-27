// @ts-check
/**
 * Draft one pump.fun trade for Submission to seal (ADR-0032). Nothing here signs or sends.
 *
 * The buy opens the buyer's token account and, on a first buy, their volume accumulator, so the
 * compute budget allows for those initialisations. The policy values are solOS's own, never the
 * provider's.
 */
import { Effect } from "effect";
import { planPumpBuy } from "./pump-buy-plan.js";
import { planPumpSell } from "./pump-sell-plan.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** Local v1 policy for a buy: room for the account initialisations the instruction performs. */
export const PUMP_BUY_V1_CONFIG = Object.freeze({
  computeUnitLimit: 300_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

/**
 * Draft one pump trade. Both directions share the v1 budget; only the planner differs, and each
 * planner decides its own refusals. Sealing proves the lifetime before any signer is involved.
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos/actions").SwapAction} action
 * @param {(ctx: Rpc, action: import("@solos/actions").SwapAction, signer: Kit["signer"]) =>
 *   import("effect").Effect.Effect<
 *     { quote: unknown; instructions: readonly unknown[] },
 *     import("@solos/core").BuildRejected | import("@solos/core").RpcError
 *   >} planner
 */
const draftPumpTrade = ({ ctx, kit }, action, planner) =>
  Effect.map(planner(ctx, action, kit.signer), (plan) => ({
    /** @type {import("../submission/seal-draft.js").Draft} */
    draft: {
      label: "pump trade",
      instructions: /** @type {any} */ (plan.instructions),
      config: PUMP_BUY_V1_CONFIG,
    },
    quote: plan.quote,
  })).pipe(Effect.withSpan("executor.buildPumpBuy"));

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {import("@solos/actions").SwapAction} action */
export const draftPumpBuy = (deps, action) => draftPumpTrade(deps, action, planPumpBuy);

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {import("@solos/actions").SwapAction} action */
export const draftPumpSell = (deps, action) => draftPumpTrade(deps, action, planPumpSell);
