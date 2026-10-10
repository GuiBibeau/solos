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
