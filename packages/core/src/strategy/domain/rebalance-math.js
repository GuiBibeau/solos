// @ts-check
import { plainDecimal } from "./decimal.js";

const SCALE = 12;
const SCALE_UNIT = 10n ** BigInt(SCALE);

/** @param {string} value */
const fractionLength = (value) => {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
};

/** @param {string} value @param {number} width */
const unitsOf = (value, width) => {
  const [whole, frac = ""] = value.split(".", 2);
  return BigInt(`${whole || "0"}${frac.padEnd(width, "0")}`);
};

/**
 * USD value of a base-unit amount, scaled by 1e12 and floored. Undefined when the price
 * is not a positive decimal.
 * @param {string} amount
 * @param {number} decimals
 * @param {string} price
 */
export const usdScaled = (amount, decimals, price) => {
  const plain = plainDecimal(price);
  if (plain === undefined) return undefined;
  const width = fractionLength(plain);
  const priceUnits = unitsOf(plain, width);
  if (priceUnits <= 0n) return 0n;
  const numerator = BigInt(amount) * priceUnits * SCALE_UNIT;
  const denominator = 10n ** BigInt(decimals) * 10n ** BigInt(width);
  return numerator / denominator;
};

/** @param {bigint} scaled */
export const scaledDecimal = (scaled) => {
  const digits = scaled.toString().padStart(SCALE + 1, "0");
  const whole = digits.slice(0, -SCALE);
  const frac = digits.slice(-SCALE).replace(/0+$/, "");
  return frac.length === 0 ? whole : `${whole}.${frac}`;
};

/** Current weight as a decimal string. @param {bigint} part @param {bigint} total */
export const ratioDecimal = (part, total) => {
  if (total <= 0n) return "0";
  return scaledDecimal((part * SCALE_UNIT) / total);
};

/**
 * Absolute drift from `target` in basis points, floored.
 * @param {bigint} current
 * @param {bigint} total
 * @param {string} target
 */
export const driftBpsOf = (current, total, target) => {
  const targetScaled = usdScaled("1", 0, target);
  if (targetScaled === undefined) return 0;
  if (total <= 0n) return Number((targetScaled * 10_000n) / SCALE_UNIT);
  const delta = abs(current * SCALE_UNIT - targetScaled * total);
  return Number((delta * 10_000n) / (total * SCALE_UNIT));
};

/**
 * Base units bought by `deltaScaled` USD at `price`, floored.
 * @param {bigint} deltaScaled
 * @param {string} price
 * @param {number} decimals
 */
export const baseUnitsFloor = (deltaScaled, price, decimals) => {
  const plain = plainDecimal(price);
  if (plain === undefined || deltaScaled <= 0n) return 0n;
  const width = fractionLength(plain);
  const priceUnits = unitsOf(plain, width);
  if (priceUnits <= 0n) return 0n;
  const numerator = deltaScaled * 10n ** BigInt(decimals) * 10n ** BigInt(width);
  return numerator / (SCALE_UNIT * priceUnits);
};

/** Target USD holding, scaled by 1e12. @param {string} target @param {bigint} total */
export const targetUsdScaled = (target, total) => {
  const weight = usdScaled("1", 0, target);
  if (weight === undefined) return 0n;
  return (weight * total) / SCALE_UNIT;
};

/** @param {bigint} value */
const abs = (value) => (value < 0n ? -value : value);
