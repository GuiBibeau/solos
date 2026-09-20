// @ts-check

/** @typedef {{ readonly numerator: bigint; readonly denominator: bigint }} Ratio */

/**
 * Convert Decimal's plain/scientific positive output to an exact integer ratio.
 * @param {string} value
 * @returns {Ratio}
 */
const decimalRatio = (value) => {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(value);
  if (match === null) throw new Error("total supply is not a positive decimal");
  const fraction = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  if (!Number.isSafeInteger(exponent)) throw new Error("total-supply exponent is unsafe");
  let numerator = BigInt(`${match[1]}${fraction}`);
  const scale = fraction.length - exponent;
  const denominator = scale > 0 ? 10n ** BigInt(scale) : 1n;
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  if (numerator <= 0n) throw new Error("total supply must be positive");
  return { numerator, denominator };
};

/**
 * Convert an aggregate cToken balance with the reserve's two source quantities rather than a
 * pre-divided Decimal exchange rate. Multiplication happens before the one integer division, so
 * Decimal's 20-significant-digit division cannot move the final floor by a base unit.
 * @param {bigint} collateral
 * @param {string} cTokenSupply
 * @param {string} totalSupply
 */
export const collateralToLiquidity = (collateral, cTokenSupply, totalSupply) => {
  if (collateral === 0n) return 0n;
  const cTokens = BigInt(cTokenSupply);
  if (cTokens <= 0n) throw new Error("cToken supply must be positive");
  const liquidity = decimalRatio(totalSupply);
  return (collateral * liquidity.numerator) / (cTokens * liquidity.denominator);
};
