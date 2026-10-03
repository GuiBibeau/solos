// @ts-check
import { z } from "zod";

/**
 * Spot collateral on the Phoenix trader-state snapshot. The venue returns one row per spot asset
 * it prices for the trader, and a trader that holds none still receives a zero-balance row (SOL
 * today). Only `balance` is read, in strip mode, because provider extensions are not ours to
 * trust and nothing else escapes the adapter.
 */
const SpotCollateral = z.object({ balance: z.string().regex(/^(0|[1-9]\d*)$/) });

/** A row counts as exposure when its balance is nonzero. A shape that cannot be proven zero fails
 * closed: an unreadable balance is treated exactly like a real one, never as an absent one.
 * @param {unknown} row
 * @returns {boolean}
 */
const isNonZeroSpotBalance = (row) => {
  const parsed = SpotCollateral.safeParse(row);
  return parsed.success ? BigInt(parsed.data.balance) !== 0n : true;
};

/**
 * Whether the subaccount carries spot collateral. A zero-balance row is not exposure: the API
 * sends one for every trader, and counting it as risk rejected every flat open and forced equity
 * to null. A nonzero or malformed row still reports true.
 * @param {readonly unknown[]} rows
 * @returns {boolean}
 */
export const hasNonZeroSpotCollateral = (rows) => rows.some(isNonZeroSpotBalance);

/**
 * How many spot-collateral rows the trader actually holds. Zero-balance defaults do not count, so
 * a trader holding no spot balance keeps the exact-collateral equity path (ADR-0021).
 * @param {readonly unknown[] | undefined} rows
 * @returns {number}
 */
export const nonZeroSpotCollateralCount = (rows) =>
  (rows ?? []).filter(isNonZeroSpotBalance).length;
