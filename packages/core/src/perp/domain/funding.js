// @ts-check
import { z } from "zod";
import { PerpStateIncomplete } from "./errors.js";

const DECIMAL = /^[+-]?(?:\d+)(?:\.\d+)?$/;
const HOUR_SECONDS = 3600;
const HOURS_PER_YEAR = 24 * 365;
const EXTRA_DIGITS = 12;

/** @typedef {z.infer<typeof FundingSnapshotSchema>} FundingSnapshot */
/** @typedef {z.infer<typeof GetFundingInputSchema>} GetFundingInput */

/**
 * One funding read after input validation. `market` is the wire symbol ("SOL"); the snapshot
 * prints the caller-facing label ("SOL-PERP").
 * @typedef {{ readonly market: string; readonly lookbackHours: number }} GetFundingRequest
 */

/** One print in the lookback, oldest first. Decimals stay strings. */
export const FundingHistoryPointSchema = z.object({
  at: z.string(),
  rateHourlyPct: z.string(),
});

/**
 * Public funding read. Positive `rateHourlyPct` means longs pay shorts. `history` is empty
 * when the venue published a current rate and no interval series.
 */
export const FundingSnapshotSchema = z.object({
  market: z.string(),
  at: z.string(),
  rateHourlyPct: z.string(),
  aprPct: z.string(),
  nextFundingAt: z.string().nullable(),
  history: z.array(FundingHistoryPointSchema),
});

/** One Phoenix funding read. An omitted lookback is the trailing day. */
export const GetFundingInputSchema = z.object({
  market: z
    .string()
    .min(1)
    .max(32)
    .describe("Perp market symbol, e.g. SOL or SOL-PERP (normalized to the exchange symbol)"),
  lookbackHours: z
    .number()
    .int()
    .min(1)
    .max(168)
    .default(24)
    .describe("Hours of funding history to include, from 1 to 168. Defaults to 24"),
});

/** Caller-facing market label. The wire symbol is the bare ticker. @param {string} wireSymbol */
export const fundingMarketLabel = (wireSymbol) => `${wireSymbol}-PERP`;

/**
 * @param {string} text
 * @returns {{ units: bigint; scale: number }}
 */
const parsePct = (text) => {
  if (!DECIMAL.test(text)) {
    throw new PerpStateIncomplete({ reason: "funding rate was not a signed decimal percent" });
  }
  const isNegative = text.startsWith("-");
  const body = text.replace(/^[+-]/, "");
  const [whole, frac = ""] = body.split(".", 2);
  const units = BigInt(`${whole}${frac}`);
  return { units: isNegative ? -units : units, scale: frac.length };
};

/** @param {bigint} units @param {number} scale */
const formatPct = (units, scale) => {
  const isNegative = units < 0n;
  const absolute = isNegative ? -units : units;
  const digits = absolute.toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const frac = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  const body = frac === "" ? whole : `${whole}.${frac}`;
  return isNegative && absolute !== 0n ? `-${body}` : body;
};

/** Half away from zero. @param {bigint} numerator @param {bigint} denominator */
const roundDiv = (numerator, denominator) => {
  const isNegative = numerator < 0n;
  const absolute = isNegative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return isNegative ? -rounded : rounded;
};

/**
 * Scale a signed percent by `numerator / denominator`. Exact when it divides; otherwise half
 * away from zero after twelve extra digits.
 * @param {string} pct
 * @param {number} numerator
 * @param {number} denominator
 */
export const scaleFundingPct = (pct, numerator, denominator) => {
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new PerpStateIncomplete({
      reason: "funding interval must be a positive number of seconds",
    });
  }
  const { units, scale } = parsePct(pct);
  const den = BigInt(denominator);
  let scaled = units * BigInt(numerator);
  let width = scale;
  let extra = 0;
  while (scaled % den !== 0n && extra < EXTRA_DIGITS) {
    scaled *= 10n;
    extra += 1;
    width += 1;
  }
  return formatPct(roundDiv(scaled, den), width);
};

/**
 * Hourly percent from one interval's percent. A 3600-second interval is already hourly.
 * @param {string} intervalPct
 * @param {number} intervalSeconds
 */
export const hourlyFundingPct = (intervalPct, intervalSeconds) =>
  scaleFundingPct(intervalPct, HOUR_SECONDS, intervalSeconds);

/** Annualized percent from an hourly percent, using 24 * 365 hours. @param {string} hourlyPct */
export const aprFundingPct = (hourlyPct) => scaleFundingPct(hourlyPct, HOURS_PER_YEAR, 1);
