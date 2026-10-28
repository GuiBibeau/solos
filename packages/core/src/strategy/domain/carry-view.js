// @ts-check
import { isDecimal } from "./carry-decimal.js";
import { historySamples } from "./carry-math.js";

/**
 * @typedef {{
 *   readonly instant: number;
 *   readonly apr: string | undefined;
 *   readonly fundingAt: number | undefined;
 *   readonly history: readonly { at: number; aprPct: string }[];
 *   readonly mark: string | undefined;
 *   readonly side: string;
 *   readonly perpSize: string;
 *   readonly onboarded: boolean;
 *   readonly equity: string | undefined;
 *   readonly freeCollateral: string | undefined;
 *   readonly spotBalance: string;
 *   readonly spotDecimals: number;
 *   readonly quoteBalance: string;
 *   readonly quoteDecimals: number;
 *   readonly spotPrice: string | undefined;
 *   readonly quotePrice: string | undefined;
 * }} CarryView
 */

/** @param {Readonly<Record<string, string | number>>} observations @returns {CarryView} */
export const readCarryView = (observations) => ({
  instant: integer(observations.instant) ?? 0,
  apr: decimal(observations.currentAprPct),
  fundingAt: fundingAt(observations),
  history: historySamples(observations.fundingHistory),
  mark: positive(observations.markPriceUsd),
  side: text(observations.perpSide),
  perpSize: digits(observations.perpSize),
  onboarded: observations.onboarded === 1 || observations.onboarded === "1",
  equity: decimal(observations.equityUsd),
  freeCollateral: decimal(observations.freeCollateralUsd),
  spotBalance: digits(observations.spotBalance),
  spotDecimals: decimals(observations.spotDecimals),
  quoteBalance: digits(observations.quoteBalance),
  quoteDecimals: decimals(observations.quoteDecimals),
  spotPrice: positive(observations.spotPriceUsd),
  quotePrice: positive(observations.quotePriceUsd),
});

/** @param {Readonly<Record<string, string | number>>} observations */
const fundingAt = (observations) => {
  const at = observations.fundingAt;
  if (typeof at === "number" && Number.isSafeInteger(at)) return at;
  if (typeof at !== "string") return undefined;
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** @param {unknown} value */
const decimal = (value) => (typeof value === "string" && isDecimal(value) ? value : undefined);

/** @param {unknown} value */
const positive = (value) => {
  const parsed = decimal(value);
  if (parsed === undefined || parsed.startsWith("-") || !/[1-9]/.test(parsed)) return undefined;
  return parsed;
};

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value : "");

/** @param {unknown} value */
const digits = (value) => (typeof value === "string" && /^\d+$/.test(value) ? value : "0");

/** @param {unknown} value */
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

/** @param {unknown} value */
const decimals = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 18 ? value : 0;
