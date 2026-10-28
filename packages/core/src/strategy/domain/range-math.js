// @ts-check
import { meteoraWidthIssue } from "@solos-sh/actions";
import { addDecimal } from "./decimal.js";
import { scaledDecimal, usdScaled } from "./rebalance-math.js";

/** Milliseconds in one UTC day. The recenter budget rolls on this boundary. */
export const UTC_DAY_MS = 86_400_000;

/** UTC day index for an epoch millisecond. @param {number} instant */
export const recenterDay = (instant) => Math.floor(instant / UTC_DAY_MS);

/**
 * Lower bin of a window of `width` centred on `activeId`.
 * @param {number} activeId
 * @param {number} width
 */
export const centeredLowerBin = (activeId, width) => activeId - Math.floor(width / 2);

/**
 * Why this centred window cannot be opened, or null when it is legal.
 * @param {number} lowerBinId
 * @param {number} width
 */
export const windowIssue = (lowerBinId, width) => meteoraWidthIssue(lowerBinId, width);

/**
 * USD value of token legs. A missing price contributes zero.
 * @param {ReadonlyArray<{ amount: string; decimals: number; price: string }>} legs
 */
export const positionValueUsd = (legs) => {
  let total = "0";
  for (const leg of legs) total = addDecimal(total, legUsd(leg));
  return total;
};

/** @param {{ amount: string; decimals: number; price: string }} leg */
const legUsd = (leg) => {
  if (!/^\d+$/.test(leg.amount)) return "0";
  const scaled = usdScaled(leg.amount, leg.decimals, leg.price);
  return scaled === undefined ? "0" : scaledDecimal(scaled);
};
