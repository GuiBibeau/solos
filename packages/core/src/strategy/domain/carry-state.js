// @ts-check
import { isDecimal } from "./carry-decimal.js";

/**
 * @typedef {{
 *   readonly spotAmount: string;
 *   readonly perpNotionalUsd: string;
 *   readonly perpSize: string;
 *   readonly entryAt: number | null;
 *   readonly entryFundingAprPct: string;
 *   readonly trailingMeanAprPct: string;
 *   readonly entryHurdleAprPct: string;
 *   readonly exitHurdleAprPct: string;
 *   readonly breakEvenAprPct: string;
 *   readonly fundingSamples: readonly { at: number; aprPct: string }[];
 *   readonly reason: string;
 *   readonly pauseAfter: boolean;
 *   readonly pauseReason: string;
 *   readonly naked: boolean;
 *   readonly market: string;
 *   readonly side: string;
 * }} CarryState
 */

/** @param {unknown} value @returns {CarryState} */
export const readCarryState = (value) => {
  const row = recordOf(value) ?? {};
  return {
    spotAmount: digits(row.spotAmount),
    perpNotionalUsd: digits(row.perpNotionalUsd),
    perpSize: digits(row.perpSize),
    entryAt: integer(row.entryAt),
    entryFundingAprPct: decimal(row.entryFundingAprPct),
    trailingMeanAprPct: decimal(row.trailingMeanAprPct),
    entryHurdleAprPct: decimal(row.entryHurdleAprPct),
    exitHurdleAprPct: decimal(row.exitHurdleAprPct),
    breakEvenAprPct: decimal(row.breakEvenAprPct),
    fundingSamples: samplesOf(row.fundingSamples),
    reason: text(row.reason),
    pauseAfter: row.pauseAfter === true,
    pauseReason: text(row.pauseReason),
    naked: row.naked === true,
    market: text(row.market),
    side: sideOf(row.side),
  };
};

/** A decision state this kind wrote. @param {unknown} state */
export const isCarryState = (state) =>
  typeof state === "object" && state !== null && "breakEvenAprPct" in state;

/**
 * A settled open with a failed later step leaves a naked short for the next tick.
 * @param {{ readonly state?: unknown; readonly actions?: ReadonlyArray<{ readonly type: string; readonly notionalUsd?: string }> }} decision
 * @param {string} outcome
 * @param {{ readonly intents?: ReadonlyArray<{ readonly state?: string }> } | undefined} extra
 */
export const persistedCarry = (decision, outcome, extra) => {
  const state = readCarryState(decision.state);
  if (outcome === "executed" || !openSettled(decision, extra)) return state;
  const notional = decision.actions?.[0]?.notionalUsd;
  return {
    ...state,
    spotAmount: "0",
    naked: true,
    pauseAfter: false,
    ...(typeof notional === "string" && { perpNotionalUsd: notional }),
  };
};

/**
 * @param {{ readonly actions?: ReadonlyArray<{ readonly type: string }> }} decision
 * @param {{ readonly intents?: ReadonlyArray<{ readonly state?: string }> } | undefined} extra
 */
const openSettled = (decision, extra) => {
  if (extra === undefined) return false;
  if (decision.actions?.[0]?.type !== "open_perp") return false;
  return extra.intents?.[0]?.state === "settled";
};

/** @param {unknown} value */
const recordOf = (value) =>
  typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : undefined;

/** @param {unknown} value */
const text = (value) => (typeof value === "string" ? value : "");

/** @param {unknown} value */
const digits = (value) => (typeof value === "string" && /^\d+$/.test(value) ? value : "");

/** @param {unknown} value */
const decimal = (value) => (typeof value === "string" && isDecimal(value) ? value : "");

/** @param {unknown} value */
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

/** @param {unknown} value */
const sideOf = (value) => {
  if (typeof value !== "string") return "";
  return ["short", "long", "flat"].includes(value) ? value : "";
};

/** @param {unknown} value */
const samplesOf = (value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap(oneSample);
};

/** @param {unknown} value */
const oneSample = (value) => {
  if (typeof value !== "object" || value === null) return [];
  const row = /** @type {{ at?: unknown; aprPct?: unknown }} */ (value);
  const at = integer(row.at);
  if (at === null || typeof row.aprPct !== "string" || !isDecimal(row.aprPct)) return [];
  return [{ at, aprPct: row.aprPct }];
};
