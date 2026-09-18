// @ts-check

/**
 * Slippage-tolerance bound for the Jupiter Swap V2 quote. The requested tolerance is a maximum
 * loss, so the echoed `slippageBps` must equal the request and the threshold must satisfy
 * `floor(outAmount * (10000 - slippageBps) / 10000) <= otherAmountThreshold <= outAmount`,
 * with the verified Jupiter integer rounding (floor division; live examples compute
 * `floor(netOut * 9950 / 10000)` at 50 bps). A threshold above the floor is more protective
 * than requested and stays allowed; a threshold below it means the provider allows more
 * slippage than requested and is rejected. At 0 bps the bound collapses to equality.
 */

/**
 * Exact output floor at the requested tolerance, BigInt floor division.
 * @param {string} outAmount
 * @param {number} slippageBps
 */
const worstCaseFor = (outAmount, slippageBps) =>
  (BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n;

/**
 * The tolerance is a maximum loss: the threshold must protect at least the requested worst
 * case. Below the floor the provider allows more slippage than requested; at 0 bps the bound
 * collapses to equality with the output.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
export const toleranceRejection = (quote) => {
  const floor = worstCaseFor(quote.outAmount, quote.slippageBps);
  if (BigInt(/** @type {string} */ (quote.otherAmountThreshold)) < floor) {
    return "minimum output was below the exact worst case for the requested slippage tolerance";
  }
  return undefined;
};
