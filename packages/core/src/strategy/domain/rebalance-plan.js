// @ts-check
import { baseUnitsFloor, driftBpsOf, ratioDecimal, targetUsdScaled } from "./rebalance-math.js";

/**
 * @typedef {{
 *   readonly mint: string;
 *   readonly current: bigint;
 *   readonly price: string;
 *   readonly decimals: number;
 * }} Holding
 */

/**
 * @typedef {{
 *   readonly side: "sell" | "buy";
 *   readonly notional: bigint;
 *   readonly action: import("@solos-sh/actions").SwapAction;
 * }} Leg
 */

/**
 * Per-mint weight, target, and drift persisted on the Tick.
 * @param {import("@solos-sh/actions").RebalanceParams} params
 * @param {readonly Holding[]} rows
 * @param {bigint} total
 */
export const weightState = (params, rows, total) => {
  /** @type {Record<string, { weight: string; target: string; driftBps: number }>} */
  const mints = {};
  for (const row of rows) {
    const target = params.targets[row.mint];
    if (target === undefined) continue;
    mints[row.mint] = {
      weight: ratioDecimal(row.current, total),
      target,
      driftBps: driftBpsOf(row.current, total, target),
    };
  }
  return { mints };
};

/**
 * True when any target mint sits outside the band.
 * @param {import("@solos-sh/actions").RebalanceParams} params
 * @param {readonly Holding[]} rows
 * @param {bigint} total
 */
export const outsideBand = (params, rows, total) => {
  for (const row of rows) {
    const target = params.targets[row.mint];
    if (target !== undefined && driftBpsOf(row.current, total, target) > params.bandBps) {
      return true;
    }
  }
  return false;
};

/**
 * Swaps that pull non-quote mints back to target. Largest USD notional first.
 * Sells precede buys when the notional matches. The quote mint absorbs the residual.
 * @param {{
 *   params: import("@solos-sh/actions").RebalanceParams;
 *   rows: readonly Holding[];
 *   total: bigint;
 *   minScaled: bigint;
 * }} input
 */
export const planTrades = (input) => {
  const { params, rows, total, minScaled } = input;
  const quote = rows.find((row) => row.mint === params.quoteMint);
  if (quote === undefined) return [];
  /** @type {Leg[]} */
  const legs = [];
  for (const row of rows) {
    const leg = legFor({ params, row, total, minScaled, quote });
    if (leg !== undefined) legs.push(leg);
  }
  return legs.toSorted(byNotional).map((leg) => leg.action);
};

/**
 * @param {{
 *   params: import("@solos-sh/actions").RebalanceParams;
 *   row: Holding;
 *   total: bigint;
 *   minScaled: bigint;
 *   quote: Holding;
 * }} input
 * @returns {Leg | undefined}
 */
const legFor = (input) => {
  const target = input.params.targets[input.row.mint];
  if (target === undefined || input.row.mint === input.params.quoteMint) return undefined;
  const delta = targetUsdScaled(target, input.total) - input.row.current;
  const notional = delta < 0n ? -delta : delta;
  if (notional < input.minScaled) return undefined;
  return delta < 0n ? sell(input, notional) : buy(input, notional);
};

/**
 * @param {{ params: import("@solos-sh/actions").RebalanceParams; row: Holding }} input
 * @param {bigint} notional
 * @returns {Leg | undefined}
 */
const sell = (input, notional) => {
  const amount = baseUnitsFloor(notional, input.row.price, input.row.decimals);
  if (amount <= 0n) return undefined;
  return {
    side: "sell",
    notional,
    action: swap({
      inputMint: input.row.mint,
      outputMint: input.params.quoteMint,
      amount,
      maxSlippageBps: input.params.maxSlippageBps,
    }),
  };
};

/**
 * @param {{ params: import("@solos-sh/actions").RebalanceParams; row: Holding; quote: Holding }} input
 * @param {bigint} notional
 * @returns {Leg | undefined}
 */
const buy = (input, notional) => {
  const amount = baseUnitsFloor(notional, input.quote.price, input.quote.decimals);
  if (amount <= 0n) return undefined;
  return {
    side: "buy",
    notional,
    action: swap({
      inputMint: input.params.quoteMint,
      outputMint: input.row.mint,
      amount,
      maxSlippageBps: input.params.maxSlippageBps,
    }),
  };
};

/**
 * @param {{
 *   inputMint: string;
 *   outputMint: string;
 *   amount: bigint;
 *   maxSlippageBps: number;
 * }} input
 * @returns {import("@solos-sh/actions").SwapAction}
 */
const swap = (input) => ({
  type: "swap",
  inputMint: input.inputMint,
  outputMint: input.outputMint,
  amount: input.amount.toString(),
  maxSlippageBps: input.maxSlippageBps,
});

/** @param {Leg} left @param {Leg} right */
const byNotional = (left, right) => {
  if (left.notional === right.notional) return left.side === right.side ? 0 : sideOrder(left.side);
  return left.notional > right.notional ? -1 : 1;
};

/** Sells sort ahead of buys. @param {"sell" | "buy"} side */
const sideOrder = (side) => (side === "sell" ? -1 : 1);
