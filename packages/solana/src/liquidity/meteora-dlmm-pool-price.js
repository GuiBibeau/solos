// @ts-check
/**
 * Active-bin price as token B per one token A. `priceOfBin` is token Y lamports per token X
 * lamport in Q64.64. Mint decimals move that onto human units:
 * `priceAPerB = raw * 10^(decimalsA - decimalsB)`. The denominator is a power of two and ten,
 * so the decimal terminates.
 */
import { priceOfBin } from "./meteora-dlmm-price.js";

const Q64 = 1n << 64n;
/** Enough digits for 2^64 times a 255-decimal shift. The ratio terminates inside this bound. */
const MAX_DIGITS = 400;

/**
 * Exact decimal of a non-negative ratio, or null when it does not terminate.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {string | null}
 */
const formatRatio = (numerator, denominator) => {
  if (numerator < 0n || denominator <= 0n) return null;
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  if (remainder === 0n) return whole.toString();
  let digits = "";
  for (let step = 0; remainder !== 0n && step < MAX_DIGITS; step += 1) {
    remainder *= 10n;
    digits += (remainder / denominator).toString();
    remainder %= denominator;
  }
  if (remainder !== 0n) return null;
  while (digits.endsWith("0")) digits = digits.slice(0, -1);
  return `${whole.toString()}.${digits}`;
};

/**
 * Token B per one token A at one bin, or null when the bin price is not representable.
 * @param {{ readonly activeId: number; readonly binStep: number; readonly decimalsA: number; readonly decimalsB: number }} bin
 * @returns {string | null}
 */
export const priceAPerB = (bin) => {
  const raw = priceOfBin(bin.activeId, bin.binStep);
  if (raw === null) return null;
  const shift = bin.decimalsA - bin.decimalsB;
  const numerator = shift >= 0 ? raw * 10n ** BigInt(shift) : raw;
  const denominator = shift >= 0 ? Q64 : Q64 * 10n ** BigInt(-shift);
  return formatRatio(numerator, denominator);
};
