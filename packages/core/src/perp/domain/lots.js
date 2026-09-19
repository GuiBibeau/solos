// @ts-check
import { ValidationError } from "../../shared/domain/errors.js";

/** One quote lot is 1e-6 USDC (the venue's `MICRO_USD` scale at the pinned Rise revision). */
export const QUOTE_LOTS_DECIMALS = 6;

/**
 * Parse a wire lot figure ("basePositionLots", "collateral", …) into a bigint. Wire lots are
 * signed decimal integer strings; anything else is rejected before any conversion, so a
 * malformed amount can never be read as zero.
 * @param {string} text
 * @returns {bigint}
 */
export const parseLots = (text) => {
  if (typeof text !== "string" || !/^-?\d+$/.test(text)) {
    throw new ValidationError({
      field: "lots",
      value: typeof text === "string" ? text.slice(0, 32) : typeof text,
      reason: "expected a signed integer lot count as a decimal string",
    });
  }
  return BigInt(text);
};

/**
 * Direction from the sign of the base position lots. Flat is exactly zero — never a tiny
 * residue, never an absent row invented into zero (a zero row is flat too).
 * @param {bigint} lots
 * @returns {"long" | "short" | "flat"}
 */
export const sideFromLots = (lots) => {
  if (lots > 0n) return "long";
  if (lots < 0n) return "short";
  return "flat";
};

/**
 * Exact lot → base-unit conversion: `lots / 10^decimals` as a signed decimal string, computed
 * with BigInt only. A JS Number never touches the value, so "1500" lots at 2 decimals is
 * exactly "15" and "-1" lot is exactly "-0.01".
 * @param {bigint} lots
 * @param {number} decimals base-lot decimals from the market metadata
 * @returns {string}
 */
export const lotsToBaseUnits = (lots, decimals) => {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new ValidationError({
      field: "decimals",
      value: decimals,
      reason: "expected a nonnegative integer lot size",
    });
  }
  const scale = 10n ** BigInt(decimals);
  const negative = lots < 0n;
  const absolute = negative ? -lots : lots;
  const whole = absolute / scale;
  const frac = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  const sign = negative && absolute !== 0n ? "-" : "";
  return frac === "" ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
};

/**
 * Quote lots → exact signed USD decimal string (1 quote lot = 1e-6 USDC).
 * @param {bigint} lots
 * @returns {string}
 */
export const quoteLotsToUsd = (lots) => lotsToBaseUnits(lots, QUOTE_LOTS_DECIMALS);
