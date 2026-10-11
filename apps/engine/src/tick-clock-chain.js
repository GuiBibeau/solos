// @ts-check
import { SpendMeter, addDecimal, usdForLamports } from "@solos/core/strategy";
import { landedFeeLamports } from "@solos/solana";
import { Effect } from "effect";

/** Signature lookups per clock pass. Each lookup is at most three RPC calls. */
export const RPC_BUDGET = 8;

/** @typedef {{ left: number }} RpcBudget */

/**
 * @typedef {{ kind: "leave" } | {
 *   kind: "settle";
 *   usd: string;
 *   outcome: "executed" | "failed";
 * } | { kind: "release"; outcome: "failed" }} SpendDecision
 */

/** @typedef {{
 *   readonly actualUsd: string;
 *   readonly reserveUsd: string;
 *   readonly mint: string;
 *   readonly solPriceUsd?: string;
 * }} SpendQuote */

/** @returns {RpcBudget} */
export const openBudget = () => ({ left: RPC_BUDGET });

/**
 * @param {RpcBudget} budget
 * @param {number} count
 */
export const takeRpc = (budget, count) => {
  if (budget.left < count) return false;
  budget.left -= count;
  return true;
};

/**
 * Confirmed spend is input notional plus `meta.fee` (ADR-0038). A landed error settles the
 * fee alone. A missing fee leaves the hold open.
 * @param {SpendQuote} quote
 * @param {"confirmed" | "failed"} status
 * @param {string | undefined} feeLamports
 * @returns {SpendDecision}
 */
export const measuredSpend = (quote, status, feeLamports) => {
  if (status === "confirmed") return confirmedSpend(quote, feeLamports);
  return failedSpend(quote, feeLamports);
};

/** @param {string} signature */
export const readFee = (signature) =>
  landedFeeLamports(signature).pipe(
    Effect.map((fee) => (fee === undefined ? undefined : fee.toString())),
    Effect.catchAll(() => Effect.succeed(undefined)),
  );

/** @param {import("@solos-sh/actions").Action | undefined} action */
export const readQuote = (action) =>
  Effect.gen(function* () {
    if (action === undefined) return undefined;
    const meter = yield* SpendMeter;
    return yield* meter.quote(action).pipe(Effect.catchAll(() => Effect.succeed(undefined)));
  });

/**
 * @param {SpendQuote} quote
 * @param {string | undefined} feeLamports
 * @returns {SpendDecision}
 */
const confirmedSpend = (quote, feeLamports) => {
  if (quote.solPriceUsd === undefined) return settled(quote.actualUsd, "executed");
  const feeUsd = pricedFee(feeLamports, quote.solPriceUsd);
  if (feeUsd === undefined) return { kind: "leave" };
  return settled(addDecimal(quote.actualUsd, feeUsd), "executed");
};

/**
 * @param {SpendQuote} quote
 * @param {string | undefined} feeLamports
 * @returns {SpendDecision}
 */
const failedSpend = (quote, feeLamports) => {
  if (quote.solPriceUsd === undefined) return { kind: "leave" };
  const feeUsd = pricedFee(feeLamports, quote.solPriceUsd);
  if (feeUsd === undefined) return { kind: "leave" };
  return settled(feeUsd, "failed");
};

/**
 * @param {string} usd
 * @param {"executed" | "failed"} outcome
 * @returns {SpendDecision}
 */
const settled = (usd, outcome) => ({ kind: "settle", usd, outcome });

/** @param {string | undefined} lamports @param {string} priceUsd */
const pricedFee = (lamports, priceUsd) => {
  if (lamports === undefined) return undefined;
  return usdForLamports(lamports, priceUsd);
};
