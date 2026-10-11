// @ts-check

/** Digits after the decimal point. No dot means a whole number. @param {string} value */
const fractionLength = (value) => {
  const dot = value.indexOf(".");
  if (dot === -1) return 0;
  return value.length - dot - 1;
};

/**
 * Scale a decimal string to an integer of `width` fractional digits. No digit is dropped
 * and no digit is rounded.
 * @param {string} value
 * @param {number} width
 */
const scaledUnits = (value, width) => {
  const [whole, frac = ""] = value.split(".", 2);
  return BigInt(`${whole}${frac.padEnd(width, "0")}`);
};

/**
 * Compare two decimal strings exactly. Positive when `left` is greater. Both sides are
 * scaled to the wider fractional length, so a difference past any fixed width still counts.
 * Trigger prices and cap amounts share this helper.
 * @param {string} left
 * @param {string} right
 */
export const compareDecimal = (left, right) => {
  const width = Math.max(fractionLength(left), fractionLength(right));
  const delta = scaledUnits(left, width) - scaledUnits(right, width);
  if (delta === 0n) return 0;
  return delta > 0n ? 1 : -1;
};

/** @param {bigint} units @param {number} width */
const fromUnits = (units, width) => {
  const digits = units.toString().padStart(width + 1, "0");
  if (width === 0) return digits;
  return `${digits.slice(0, -width)}.${digits.slice(-width)}`;
};

/**
 * Add two non-negative decimal strings exactly. The result keeps the wider fractional length.
 * @param {string} left
 * @param {string} right
 */
export const addDecimal = (left, right) => {
  const width = Math.max(fractionLength(left), fractionLength(right));
  return fromUnits(scaledUnits(left, width) + scaledUnits(right, width), width);
};

/**
 * Subtract two non-negative decimal strings exactly. `left` must be greater than `right`.
 * The result keeps the wider fractional length.
 * @param {string} left
 * @param {string} right
 */
export const subtractDecimal = (left, right) => {
  const width = Math.max(fractionLength(left), fractionLength(right));
  return fromUnits(scaledUnits(left, width) - scaledUnits(right, width), width);
};

/**
 * Multiply two non-negative decimal strings exactly. The result keeps both fractional lengths.
 * @param {string} left
 * @param {string} right
 */
export const mulDecimal = (left, right) => {
  const leftWidth = fractionLength(left);
  const rightWidth = fractionLength(right);
  const units = scaledUnits(left, leftWidth) * scaledUnits(right, rightWidth);
  return fromUnits(units, leftWidth + rightWidth);
};

/**
 * Divide a non-negative decimal by a positive integer, rounding away from zero.
 * The result keeps at least eight fractional digits.
 * @param {string} left
 * @param {string} denominator
 */
export const divDecimalUp = (left, denominator) => {
  const width = Math.max(fractionLength(left), 8);
  const den = BigInt(denominator);
  const units = scaledUnits(left, width);
  return fromUnits((units + den - 1n) / den, width);
};
