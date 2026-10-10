// @ts-check
import { transferFeeReserveLamports } from "@solos/solana/executor/transfer-fee";

/** Digits after the decimal point. No dot means a whole number. @param {string} value */
const fractionWidth = (value) => {
  const dot = value.indexOf(".");
  if (dot === -1) return 0;
  return value.length - dot - 1;
};

/**
 * Exact USD value of a lamport amount at a USD-per-SOL price. The scale is the price's
 * fractional digits plus nine, so no lamport is rounded away and nothing is rounded up.
 * @param {string} lamports
 * @param {string} priceUsd
 * @returns {string | undefined}
 */
export const lamportsToUsd = (lamports, priceUsd) => {
  if (!/^\d+$/.test(lamports) || !/^\d+(\.\d+)?$/.test(priceUsd)) return undefined;
  const width = fractionWidth(priceUsd);
  const [whole, frac = ""] = priceUsd.split(".", 2);
  const units = BigInt(lamports) * BigInt(`${whole}${frac}`);
  return trimZeros(fromUnits(units, width + 9));
};

/**
 * Principal plus the fee reserve the transfer builder sets (base signature fee plus the
 * priority fee from its compute-unit price times its compute-unit limit).
 * A zero-lamport transfer still holds the fee.
 * @param {string} lamports
 * @param {string} priceUsd
 * @returns {string | undefined}
 */
export const transferNotionalUsd = (lamports, priceUsd) => {
  if (!/^\d+$/.test(lamports)) return undefined;
  const held = (BigInt(lamports) + transferFeeReserveLamports()).toString();
  return lamportsToUsd(held, priceUsd);
};

/** @param {bigint} units @param {number} width */
const fromUnits = (units, width) => {
  const digits = units.toString().padStart(width + 1, "0");
  if (width === 0) return digits;
  return `${digits.slice(0, -width)}.${digits.slice(-width)}`;
};

/** @param {string} value */
const trimZeros = (value) => value.replace(/(\.\d*?)0+$/u, "$1").replace(/\.$/u, "");
