// @ts-check
import { z } from "zod";

export const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_DECIMALS = 9;

/** Lamports travel as decimal strings at boundaries because JSON has no bigint. */
export const LamportsSchema = z
  .union([z.bigint(), z.string().regex(/^\d+$/), z.number().int().nonnegative()])
  .transform(BigInt)
  .describe("Amount in lamports (1 SOL = 1e9 lamports)");

/**
 * SOL amount as a decimal string or number, e.g. "0.25". Max 9 decimals. The number side
 * accepts the whole finite numeric domain on purpose: zero and negatives must reach the
 * consuming domain rule, which rejects them as a structured ValidationError, instead of
 * failing earlier as an unstructured Zod parse error.
 */
export const SolAmountSchema = z
  .union([z.number(), z.string().regex(/^\d+(\.\d{1,9})?$/)])
  .describe("Amount in SOL as a decimal, e.g. 0.25");

const EXPONENT_NOTATION = /^[+-]?\d+(?:\.\d*)?[eE][+-]?\d+$/;

/**
 * Rewrite exponent notation ("1.5e-7", how JS prints tiny numbers) as positional digits
 * ("0.00000015") by moving the decimal point with string operations only, so the exact value
 * never passes through floating-point math.
 * @param {string} text
 * @returns {string}
 */
const expandExponent = (text) => {
  if (!EXPONENT_NOTATION.test(text)) return text;
  const parts = text.split(/[eE]/);
  const plain = /** @type {string} */ (parts[0]).replace(/^[+-]/, "").split(".", 2);
  const whole = /** @type {string} */ (plain[0]);
  const digits = whole + (plain[1] ?? "");
  const point = whole.length + Number(parts[1]);
  const sign = text.startsWith("-") ? "-" : "";
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
};

/**
 * @param {string | number} sol
 * @returns {bigint}
 */
export const solToLamports = (sol) => {
  const [whole = "0", fraction = ""] = expandExponent(String(sol)).split(".", 2);
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
