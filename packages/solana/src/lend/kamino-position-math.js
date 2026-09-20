// @ts-check

/** @typedef {{ readonly numerator: bigint; readonly denominator: bigint }} Ratio */

/**
 * Convert Decimal's plain/scientific positive output to an exact integer ratio.
 * @param {string} value
 * @returns {Ratio}
 */
export const decimalRatio = (value) => {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (match === null) throw new Error("exchange rate is not a positive decimal");
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  if (!Number.isSafeInteger(exponent)) throw new Error("exchange-rate exponent is unsafe");
  let numerator = BigInt(`${match[1]}${fraction}`);
  const scale = fraction.length - exponent;
  const denominator = scale > 0 ? 10n ** BigInt(scale) : 1n;
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  if (numerator <= 0n) throw new Error("exchange rate must be positive");
  return { numerator, denominator };
};

/**
 * Kamino's rate is collateral tokens per underlying liquidity unit. Aggregate collateral
 * first, divide as integers once, and floor the remainder toward zero.
 * @param {bigint} collateral
 * @param {string} collateralPerLiquidity
 */
export const collateralToLiquidity = (collateral, collateralPerLiquidity) => {
  const rate = decimalRatio(collateralPerLiquidity);
  return (collateral * rate.denominator) / rate.numerator;
};
