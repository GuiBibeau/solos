// @ts-check
import { isDecimal, meanSigned, mulSigned, trimDecimal } from "./carry-decimal.js";
import { divDecimalUp, mulDecimal } from "./decimal.js";

const HOUR_MS = 3_600_000;
const HOURS_PER_YEAR = 8760;

/**
 * @typedef {{ readonly at: number; readonly aprPct: string }} FundingSample
 */

/** Break-even APR: roundTripCostPct * 8760 / expectedHoldHours. @param {string} cost @param {number} hours */
export const breakEvenAprPct = (cost, hours) =>
  trimDecimal(divDecimalUp(mulDecimal(cost, String(HOURS_PER_YEAR)), String(hours)));

/** Annualize an hourly percent. @param {string} hourly */
export const aprFromHourly = (hourly) => trimDecimal(mulSigned(hourly, String(HOURS_PER_YEAR)));

/**
 * Samples inside the lookback, oldest first. Current is included with them.
 * With no sample in the window, the current print is the whole mean.
 * @param {{
 *   prior: readonly FundingSample[];
 *   history: readonly FundingSample[];
 *   current: FundingSample | undefined;
 *   now: number;
 *   lookbackHours: number;
 * }} input
 */
export const windowSamples = (input) => {
  const { prior, history, current, now, lookbackHours } = input;
  const start = now - lookbackHours * HOUR_MS;
  /** @type {Map<number, string>} */
  const map = new Map();
  for (const sample of [...history, ...prior]) keep(map, sample, { start, now });
  const isHadPrior = map.size > 0;
  if (current !== undefined) keep(map, current, { start, now });
  if (current !== undefined && !isHadPrior && map.size === 0) map.set(current.at, current.aprPct);
  return [...map]
    .map(([at, aprPct]) => ({ at, aprPct }))
    .toSorted((left, right) => left.at - right.at);
};

/**
 * @param {Map<number, string>} map
 * @param {FundingSample} sample
 * @param {{ start: number; now: number }} window
 */
const keep = (map, sample, window) => {
  if (sample.at < window.start || sample.at > window.now) return;
  map.set(sample.at, sample.aprPct);
};

/** Trailing mean APR, or undefined when nothing was printed. @param {readonly FundingSample[]} samples */
export const trailingMean = (samples) => meanSigned(samples.map((sample) => sample.aprPct));

/**
 * Parse a funding history JSON string. Hourly percents are annualized.
 * @param {unknown} raw
 * @returns {FundingSample[]}
 */
export const historySamples = (raw) => {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(onePoint);
};

/** @param {string} raw */
const parseJson = (raw) => {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

/** @param {unknown} point */
const onePoint = (point) => {
  if (typeof point !== "object" || point === null) return [];
  const row = /** @type {{ at?: unknown; aprPct?: unknown; rateHourlyPct?: unknown }} */ (point);
  const at = instantOf(row.at);
  const apr = aprOf(row);
  if (at === undefined || apr === undefined) return [];
  return [{ at, aprPct: apr }];
};

/** @param {{ aprPct?: unknown; rateHourlyPct?: unknown }} row */
const aprOf = (row) => {
  if (typeof row.aprPct === "string" && isDecimal(row.aprPct)) return trimDecimal(row.aprPct);
  if (typeof row.rateHourlyPct === "string" && isDecimal(row.rateHourlyPct)) {
    return aprFromHourly(row.rateHourlyPct);
  }
  return undefined;
};

/** @param {unknown} value */
const instantOf = (value) => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string") return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
