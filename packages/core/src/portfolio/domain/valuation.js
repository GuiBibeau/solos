// @ts-check

/**
 * Exact fixed-point USD math for portfolio valuation (ADR-0018). All amounts and prices are
 * decimal strings or BigInt base units; every result is a signed BigInt scaled to 6 USD
 * decimals. Division floors toward negative infinity, so asset values are rounded down as the
 * contract requires and signed equity keeps a single consistent rounding rule.
 */

const SCALE = 6;

/** @param {number} n */
const pow10 = (n) => 10n ** BigInt(n);

/** Floor division: the quotient rounded toward negative infinity. */
/** @param {bigint} numerator @param {bigint} denominator */
const floorDiv = (numerator, denominator) => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  const isSameSign = remainder > 0n === denominator > 0n;
  return isSameSign ? quotient : quotient - 1n;
};

/**
 * @param {string} value a decimal string matching DecimalSchema
 * @returns {{ negative: boolean; magnitude: bigint; scale: number }}
 */
/** @param {string} value @returns {{ negative: boolean; magnitude: bigint; scale: number }} */
export const parseDecimal = (value) => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) throw new Error(`not a decimal string: ${value}`);
  return {
    negative: match[1] === "-",
    magnitude: BigInt(`${match[2]}${match[3] ?? ""}`),
    scale: (match[3] ?? "").length,
  };
};

/** @param {string} value @returns {bigint} the value at 6 USD decimals */
/** @param {string} value @returns {bigint} the value at 6 USD decimals */
export const toScaled6 = (value) => {
  const { negative, magnitude, scale } = parseDecimal(value);
  const signed = negative ? -magnitude : magnitude;
  return scale <= SCALE ? signed * pow10(SCALE - scale) : floorDiv(signed, pow10(scale - SCALE));
};

/**
 * Token valuation = amount * observed USD price / 10^decimals, floored to 6 USD decimals.
 * @param {bigint} amount base units, never negative
 * @param {number} decimals
 * @param {string} priceUsd decimal USD price
 */
/** @param {bigint} amount @param {number} decimals @param {string} priceUsd */
export const assetValueScaled6 = (amount, decimals, priceUsd) => {
  const { magnitude, scale } = parseDecimal(priceUsd);
  const numerator = amount * magnitude;
  const denominator = pow10(decimals + scale);
  return floorDiv(numerator * pow10(SCALE), denominator);
};

/** @param {bigint} scaled6 @returns {string} decimal string with exactly six decimals */
/** @param {bigint} scaled6 @returns {string} decimal string with exactly six decimals */
export const formatUsd = (scaled6) => {
  const isNegative = scaled6 < 0n;
  const magnitude = isNegative ? -scaled6 : scaled6;
  const whole = magnitude / pow10(SCALE);
  const fraction = magnitude % pow10(SCALE);
  return `${isNegative ? "-" : ""}${whole}.${fraction.toString().padStart(SCALE, "0")}`;
};
