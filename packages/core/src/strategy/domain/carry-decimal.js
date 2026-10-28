// @ts-check

/** @param {string} value */
const bodyOf = (value) => (value.startsWith("-") ? value.slice(1) : value);

/** @param {string} value */
export const fractionWidth = (value) => {
  const body = bodyOf(value);
  const dot = body.indexOf(".");
  return dot === -1 ? 0 : body.length - dot - 1;
};

/** @param {string} value */
export const isDecimal = (value) => /^-?\d+(\.\d+)?$/.test(value);

/**
 * @param {string} value
 * @param {number} width
 */
const unsignedUnits = (value, width) => {
  const [whole, frac = ""] = bodyOf(value).split(".", 2);
  return BigInt(`${whole || "0"}${frac.padEnd(width, "0")}`);
};

/**
 * @param {string} value
 * @param {number} width
 */
const signedUnits = (value, width) => {
  const units = unsignedUnits(value, width);
  return value.startsWith("-") ? -units : units;
};

/**
 * @param {bigint} units
 * @param {number} width
 */
const formatSigned = (units, width) => {
  const isNegative = units < 0n;
  const absolute = isNegative ? -units : units;
  const digits = absolute.toString().padStart(width + 1, "0");
  const text = width === 0 ? digits : joined(digits, width);
  if (text === "0") return "0";
  return isNegative ? `-${text}` : text;
};

/** @param {string} digits @param {number} width */
const joined = (digits, width) => {
  const whole = digits.slice(0, -width);
  const frac = digits.slice(-width).replace(/0+$/, "");
  return frac === "" ? whole : `${whole}.${frac}`;
};

/** Drop trailing fractional zeros. @param {string} value */
export const trimDecimal = (value) => {
  if (!value.includes(".")) return value;
  const negative = value.startsWith("-");
  const trimmed = bodyOf(value).replace(/0+$/, "").replace(/\.$/, "");
  if (trimmed === "" || trimmed === "0") return "0";
  return negative ? `-${trimmed}` : trimmed;
};

/** Exact signed compare. Positive when `left` is greater. @param {string} left @param {string} right */
export const compareSigned = (left, right) => {
  const width = Math.max(fractionWidth(left), fractionWidth(right));
  const delta = signedUnits(left, width) - signedUnits(right, width);
  if (delta === 0n) return 0;
  return delta > 0n ? 1 : -1;
};

/**
 * Signed product. Both fractional widths are kept.
 * @param {string} left
 * @param {string} right
 */
export const mulSigned = (left, right) => {
  const leftWidth = fractionWidth(left);
  const rightWidth = fractionWidth(right);
  const units = signedUnits(left, leftWidth) * signedUnits(right, rightWidth);
  return formatSigned(units, leftWidth + rightWidth);
};

/**
 * Mean of signed decimals. An empty list is undefined.
 * @param {readonly string[]} values
 */
export const meanSigned = (values) => {
  const first = values[0];
  if (first === undefined) return undefined;
  if (values.length === 1) return trimDecimal(first);
  const width = Math.max(8, ...values.map((value) => fractionWidth(value)));
  let sum = 0n;
  for (const value of values) sum += signedUnits(value, width);
  return trimDecimal(divSigned(sum, BigInt(values.length), width));
};

/**
 * Divide a signed integer already scaled to `width` by a positive integer.
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @param {number} width
 */
const divSigned = (numerator, denominator, width) => {
  const isNegative = numerator < 0n;
  let magnitude = isNegative ? -numerator : numerator;
  let scale = width;
  let guard = 0;
  while (magnitude % denominator !== 0n && guard < 12) {
    magnitude *= 10n;
    scale += 1;
    guard += 1;
  }
  const remainder = magnitude % denominator;
  let quotient = magnitude / denominator;
  if (remainder * 2n >= denominator) quotient += 1n;
  return formatSigned(isNegative ? -quotient : quotient, scale);
};

/**
 * `mark * numerator / 10000`, exact when it divides.
 * @param {string} mark
 * @param {number} numerator
 */
export const scaleBps = (mark, numerator) => {
  const width = fractionWidth(mark);
  let units = unsignedUnits(mark, width) * BigInt(numerator);
  let scale = width;
  let guard = 0;
  while (units % 10_000n !== 0n && guard < 8) {
    units *= 10n;
    scale += 1;
    guard += 1;
  }
  return formatSigned(units / 10_000n, scale);
};

/** USD decimal to 1e6 integer units, half away from zero. @param {string} usd */
export const usdMicro = (usd) => {
  const width = fractionWidth(usd);
  const units = unsignedUnits(usd, width);
  if (width <= 6) return (units * 10n ** BigInt(6 - width)).toString();
  const divisor = 10n ** BigInt(width - 6);
  const remainder = units % divisor;
  let quotient = units / divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  return quotient.toString();
};

/**
 * Floor of `usd * 10^decimals / price`. Undefined when the price is not positive.
 * @param {string} usd
 * @param {string} price
 * @param {number} decimals
 */
export const baseUnitsForUsd = (usd, price, decimals) => {
  if (compareSigned(price, "0") <= 0) return undefined;
  const priceWidth = fractionWidth(price);
  const usdWidth = fractionWidth(usd);
  const numerator = unsignedUnits(usd, usdWidth) * 10n ** BigInt(decimals + priceWidth);
  const denominator = unsignedUnits(price, priceWidth) * 10n ** BigInt(usdWidth);
  if (denominator === 0n) return undefined;
  return (numerator / denominator).toString();
};
