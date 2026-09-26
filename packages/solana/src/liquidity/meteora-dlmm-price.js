// @ts-check
/**
 * Q64.64 bin price from the pinned SDK (`get_price_from_id` / `pow` in `u64x64_math.rs` at
 * `576919e3`). Deposit shares treat token X as one share per base unit and token Y as
 * `floor(amount_y * 2^64 / price)`, the fixed-point inverse of `Bin::get_amount_out`.
 */
const U128_MAX = (1n << 128n) - 1n;
const ONE = 1n << 64n;
const SCALE = 64n;
const MAX_EXPONENTIAL = 524_288;
const BASIS = 10_000n;
const POW_BITS = 19;

/** @param {bigint} left @param {bigint} right @returns {bigint | null} */
const mulShift = (left, right) => {
  const product = left * right;
  if (product > U128_MAX) return null;
  return product >> SCALE;
};

/**
 * @param {bigint} base
 * @param {number} exponent
 * @returns {{ squared: bigint; shouldInvert: boolean; exponent: number } | null}
 */
const preparedBase = (base, exponent) => {
  let shouldInvert = exponent < 0;
  const magnitude = Math.abs(exponent);
  if (magnitude >= MAX_EXPONENTIAL) return null;
  let squared = base;
  if (squared >= ONE) {
    squared = U128_MAX / squared;
    shouldInvert = !shouldInvert;
  }
  return { squared, shouldInvert, exponent: magnitude };
};

/** @param {bigint} squared @param {number} exponent @returns {bigint | null} */
const powBits = (squared, exponent) => {
  let result = ONE;
  let bit = 1;
  for (let step = 0; step < POW_BITS; step += 1) {
    if ((exponent & bit) !== 0) {
      const next = mulShift(result, squared);
      if (next === null) return null;
      result = next;
    }
    const squaredNext = mulShift(squared, squared);
    if (squaredNext === null) return null;
    squared = squaredNext;
    bit <<= 1;
  }
  return result === 0n ? null : result;
};

/** @param {bigint} base @param {number} exponent @returns {bigint | null} */
const powQ64 = (base, exponent) => {
  if (exponent === 0) return ONE;
  const prepared = preparedBase(base, exponent);
  if (prepared === null) return null;
  const powered = powBits(prepared.squared, prepared.exponent);
  if (powered === null) return null;
  return prepared.shouldInvert ? U128_MAX / powered : powered;
};

/** Bin price in Q64.64. `binStep` is the pair's step in basis points. @param {number} binId @param {number} binStep */
export const priceOfBin = (binId, binStep) => {
  if (binStep <= 0) return null;
  const bps = (BigInt(binStep) << SCALE) / BASIS;
  return powQ64(ONE + bps, binId);
};

/**
 * Shares minted by depositing into one bin. Zero when both amounts are zero.
 * @param {{ binId: number; binStep: number; amountX: bigint; amountY: bigint }} bin
 * @returns {bigint | null}
 */
export const sharesForDeposit = (bin) => {
  const price = priceOfBin(bin.binId, bin.binStep);
  if (price === null || price === 0n) return null;
  const fromY = (bin.amountY << SCALE) / price;
  const shares = bin.amountX + fromY;
  return shares > U128_MAX ? null : shares;
};
