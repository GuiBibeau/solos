// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { plainDecimal } from "./decimal.js";
import { usdScaled } from "./rebalance-math.js";
import { outsideBand, planTrades, weightState } from "./rebalance-plan.js";

const PRICE_REMEDY =
  "ensure the price feed returns a positive USD price for every target and quote mint";

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state: { readonly mints?: Readonly<Record<string, { weight: string; target: string; driftBps: number }>> };
 *   readonly note: string;
 *   readonly failure?: { readonly reason: string; readonly remedy: string };
 * }} RebalanceDecision
 */

/**
 * Static observation names: the instant, each mint's balance, decimals, and price,
 * and `priceAt` set to the oldest per-mint quote time.
 * @param {import("@solos-sh/actions").RebalanceParams} params
 */
export const rebalanceObservations = (params) => {
  /** @type {string[]} */
  const names = ["instant", "priceAt"];
  for (const mint of rebalanceMints(params)) {
    names.push(`balance:${mint}`, `decimals:${mint}`, `price:${mint}`, `priceAt:${mint}`);
  }
  return names;
};

/** Target mints plus the quote mint, sorted and de-duplicated. @param {import("@solos-sh/actions").RebalanceParams} params */
export const rebalanceMints = (params) =>
  [...new Set([params.quoteMint, ...Object.keys(params.targets)])].toSorted(compareMint);

/** @param {string} left @param {string} right */
const compareMint = (left, right) => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

/**
 * Pure rebalance evaluation. Decimal strings only. A missing price fails the tick and
 * emits nothing.
 * @param {import("@solos-sh/actions").RebalanceParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 * @returns {RebalanceDecision}
 */
export const evaluateRebalance = (params, observations, state) => {
  const missing = missingPrice(params, observations);
  if (missing !== undefined) return failed(state, missing);
  const book = buildBook(params, observations);
  const next = weightState(params, book.rows, book.total);
  if (book.total === 0n) return held(next, "wallet value is zero");
  if (!outsideBand(params, book.rows, book.total)) return held(next, "all weights inside the band");
  const actions = planTrades({
    params,
    rows: book.rows,
    total: book.total,
    minScaled: book.minScaled,
  });
  return held(next, actions.length === 0 ? belowMinimum() : emitted(actions.length), actions);
};

/**
 * @param {import("@solos-sh/actions").RebalanceParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 */
const missingPrice = (params, observations) => {
  for (const mint of rebalanceMints(params)) {
    if (positivePrice(observations[`price:${mint}`]) === undefined) return mint;
  }
  return undefined;
};

/**
 * @param {import("@solos-sh/actions").RebalanceParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 */
const buildBook = (params, observations) => {
  const rows = rebalanceMints(params).map((mint) => holding(observations, mint));
  const total = rows.reduce((sum, row) => sum + row.current, 0n);
  const minScaled = usdScaled("1", 0, params.minTradeUsd) ?? 0n;
  return { rows, total, minScaled };
};

/**
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {string} mint
 */
const holding = (observations, mint) => {
  const price = positivePrice(observations[`price:${mint}`]) ?? "0";
  const decimals = decimalsOf(observations, mint);
  const current = usdScaled(balanceOf(observations, mint), decimals, price) ?? 0n;
  return { mint, current, price, decimals };
};

/** @param {unknown} value */
const positivePrice = (value) => {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const plain = plainDecimal(value);
  if (plain === undefined || plain.startsWith("-") || !/[1-9]/.test(plain)) return undefined;
  return plain;
};

/**
 * Native SOL and the wrapped-SOL account both count as wrapped SOL when that mint is valued.
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {string} mint
 */
const balanceOf = (observations, mint) => {
  const direct = integerText(observations[`balance:${mint}`]);
  if (mint !== WSOL_MINT) return direct;
  const native = observations["balance:SOL"] ?? observations.lamports;
  if (typeof native !== "string") return direct;
  return (BigInt(direct) + BigInt(integerText(native))).toString();
};

/** @param {unknown} value */
const integerText = (value) => (typeof value === "string" && /^\d+$/.test(value) ? value : "0");

/**
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {string} mint
 */
const decimalsOf = (observations, mint) => {
  const value = observations[`decimals:${mint}`];
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 18) {
    return value;
  }
  return mint === WSOL_MINT ? 9 : 0;
};

/** @param {unknown} state @param {string} mint @returns {RebalanceDecision} */
const failed = (state, mint) => ({
  actions: [],
  state: priorState(state),
  note: `missing price for ${mint}`,
  failure: { reason: `missing price for ${mint}`, remedy: PRICE_REMEDY },
});

/** @param {unknown} state */
const priorState = (state) =>
  typeof state === "object" && state !== null
    ? /** @type {RebalanceDecision["state"]} */ (state)
    : {};

/**
 * @param {RebalanceDecision["state"]} state
 * @param {string} note
 * @param {ReadonlyArray<import("@solos-sh/actions").Action>} [actions]
 * @returns {RebalanceDecision}
 */
const held = (state, note, actions = []) => ({ actions, state, note });

const belowMinimum = () => "every rebalance leg is below minTradeUsd";

/** @param {number} count */
const emitted = (count) => `rebalance emits ${String(count)} ${count === 1 ? "swap" : "swaps"}`;
