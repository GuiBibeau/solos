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

/**
 * The only accepted amount grammar, checked before any sign or magnitude arithmetic so
 * malformed text ("--1", "1-1", " 1", "1e") can never decay into a valid amount: one optional
 * sign, digits, an optional fraction ("1." stays valid whole SOL), and an optional exponent.
 */
const DECIMAL_SOL = /^[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/;

const EXPONENT_NOTATION = /^\d+(?:\.\d*)?[eE][+-]?\d+$/;

/**
 * Rewrite exponent notation ("1.5e-7", how JS prints tiny numbers) as positional digits
 * ("0.00000015") by moving the decimal point with string operations only, so the exact value
 * never passes through floating-point math. The input is signless and grammar-checked; signs
 * never travel through the digit movement, the caller applies them to the parsed result.
 * @param {string} text
 * @returns {string}
 */
const expandExponent = (text) => {
  if (!EXPONENT_NOTATION.test(text)) return text;
  const parts = text.split(/[eE]/);
  const plain = /** @type {string} */ (parts[0]).split(".", 2);
  const whole = /** @type {string} */ (plain[0]);
  const digits = whole + (plain[1] ?? "");
  const point = whole.length + Number(parts[1]);
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${"0".repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
};

/**
 * Exact lamports for a decimal SOL string or number, sign included. The grammar is validated
 * first, then the unsigned magnitude is parsed and the sign applied to the result, so
 * "-1e-9" is exactly -1n and no partially-parsed malformed text can come out positive.
 * Beyond nine decimals truncates, positives and negatives alike.
 * @param {string | number} sol
 * @returns {bigint}
 * @throws {RangeError} when the text is not a decimal/exponent amount
 */
export const solToLamports = (sol) => {
  const text = String(sol);
  if (!DECIMAL_SOL.test(text)) {
    throw new RangeError(`malformed SOL amount: ${JSON.stringify(text)}`);
  }
  const sign = text.startsWith("-") ? -1n : 1n;
  const [whole = "0", fraction = ""] = expandExponent(text.replace(/^[+-]/, "")).split(".", 2);
  const padded = fraction.padEnd(SOL_DECIMALS, "0").slice(0, SOL_DECIMALS);
  const magnitude = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(padded || "0");
  return sign * magnitude;
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
