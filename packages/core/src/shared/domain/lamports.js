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
 * sign, then whole digits with an optional fraction ("1." stays valid whole SOL) or a
 * leading-dot fraction (".5"), and an optional exponent.
 */
const DECIMAL_SOL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * Expansion bound for the exponent. A lamports magnitude that could ever be transferable needs
 * at most ~20 digits (lamports are u64, 18_446_744_073_709_551_615n elsewhere in this repo), so an
 * exponent beyond this belongs to no real amount, and expanding one would allocate
 * proportional to the exponent ("1e+999999999" would build a billion characters). The parser
 * stays exact below the bound ("2e+21" is pinned by tests); transferability itself remains the
 * domain rule's job.
 */
const MAX_EXPONENT = 1000;

/**
 * Shift the decimal point of a signless, grammar-checked mantissa by `exponent` places with
 * string operations only, so the exact value never passes through floating-point math. The
 * caller bounds `exponent` first; signs never travel through the digit movement.
 * @param {string} mantissa
 * @param {number} exponent
 * @returns {string}
 */
const expandExponent = (mantissa, exponent) => {
  const [whole = "", fraction = ""] = mantissa.split(".", 2);
  const digits = whole + fraction;
  const point = whole.length + exponent;
  if (point <= 0) return `0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${digits}${"0".repeat(point - digits.length)}`;
  return `${digits.slice(0, point)}.${digits.slice(point)}`;
};

/**
 * Lamports for a signless positional decimal: whole part plus up to nine fraction digits.
 * @param {string} positional
 * @returns {bigint}
 */
const positionalToLamports = (positional) => {
  const [whole = "", fraction = ""] = positional.split(".", 2);
  const padded = fraction.padEnd(SOL_DECIMALS, "0").slice(0, SOL_DECIMALS);
  return BigInt(whole || "0") * LAMPORTS_PER_SOL + BigInt(padded || "0");
};

/**
 * Exact lamports for a decimal SOL string or number, sign included. The grammar is validated
 * first and the exponent bounded before any string is built, then the unsigned magnitude is
 * parsed and the sign applied to the result, so "-1e-9" is exactly -1n and no partially-parsed
 * malformed text can come out positive. Beyond nine decimals truncates, positives and
 * negatives alike; magnitudes strictly below one lamport are zero.
 * @param {string | number} sol
 * @returns {bigint}
 * @throws {RangeError} when the text is not a decimal/exponent amount or the exponent is out of range
 */
export const solToLamports = (sol) => {
  const text = String(sol);
  if (!DECIMAL_SOL.test(text)) {
    throw new RangeError(`malformed SOL amount: ${JSON.stringify(text)}`);
  }
  const sign = text.startsWith("-") ? -1n : 1n;
  const [mantissa = "0", exponentText = "0"] = text.replace(/^[+-]/, "").split(/[eE]/, 2);
  const exponent = Number(exponentText);
  if (exponent > MAX_EXPONENT) {
    throw new RangeError(`SOL amount exponent out of range: ${JSON.stringify(text)}`);
  }
  // lamports = mantissa digits x 10^(exponent + 9); below 10^0 the amount is strictly less
  // than one lamport, so return zero without shifting the decimal point at all.
  if (mantissa.replace(".", "").length + exponent + 9 <= 0) return 0n;
  return sign * positionalToLamports(expandExponent(mantissa, exponent));
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
