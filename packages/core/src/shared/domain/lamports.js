// @ts-check
import { z } from "zod";

export const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_DECIMALS = 9;

/** Lamports travel as decimal strings at boundaries because JSON has no bigint. */
export const LamportsSchema = z
  .union([z.bigint(), z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform(BigInt)
  .describe("Amount in lamports (1 SOL = 1e9 lamports)");

/** Positive SOL amount as a decimal string or number, e.g. "0.25". Max 9 decimals. */
export const SolAmountSchema = z
  .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,9})?$/)])
  .describe("Amount in SOL as a decimal, e.g. 0.25");

/**
 * @param {string | number} sol
 * @returns {bigint}
 */
export const solToLamports = (sol) => {
  const [whole = "0", fraction = ""] = String(sol).split(".", 2);
  const padded = fraction.padEnd(SOL_DECIMALS, "0").slice(0, SOL_DECIMALS);
  return BigInt(whole) * LAMPORTS_PER_SOL + BigInt(padded || "0");
};

/**
 * @param {bigint} lamports
 * @returns {string} decimal SOL string without trailing zeros
 */
export const lamportsToSol = (lamports) => {
  const whole = lamports / LAMPORTS_PER_SOL;
  const fraction = (lamports % LAMPORTS_PER_SOL)
    .toString()
    .padStart(SOL_DECIMALS, "0")
    .replace(/0+$/, "");
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
};
