// @ts-check
/** The pinned reserve exchange rate is collateral units per underlying unit. */
const U64_MAX = (1n << 64n) - 1n;

/** @param {string} rate */
const ratioOf = (rate) => {
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(rate);
  if (match === null) return null;
  const exponent = Number(match[3] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) return null;
  const scale = (match[2] ?? "").length - exponent;
  const numerator = BigInt(`${match[1]}${match[2] ?? ""}`) * 10n ** BigInt(Math.max(0, -scale));
  const denominator = 10n ** BigInt(Math.max(0, scale));
  return numerator > 0n ? { numerator, denominator } : null;
};

/**
 * Find the least integral receipt quantity whose predicted, floored redemption is exactly
 * `amount`. The instruction takes collateral units, not underlying units; return null if
 * no integral, positive, u64 quantity can represent the requested underlying base units.
 * This is a read-time prediction, not an on-chain minimum-receipt bound.
 * @param {bigint} amount @param {string} exchangeRate
 * @returns {bigint | null}
 */
export const exactCollateralForWithdrawal = (amount, exchangeRate) => {
  const ratio = ratioOf(exchangeRate);
  if (ratio === null || amount <= 0n || amount > U64_MAX) return null;
  const { numerator, denominator } = ratio;
  const collateral = (amount * numerator + denominator - 1n) / denominator;
  if (collateral <= 0n || collateral > U64_MAX) return null;
  return (collateral * denominator) / numerator === amount ? collateral : null;
};
