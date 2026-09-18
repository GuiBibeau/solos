// @ts-check
import { BASE_UNITS, POSITIVE_BASE_UNITS } from "./jupiter-swap-quote.js";
import { toleranceRejection } from "./jupiter-swap-tolerance.js";

/**
 * Envelope and echo validation for the Jupiter Swap V2 quote-only response. Every check
 * returns a fixed reason string; raw bodies, route entries, and the API key never travel into
 * errors. Amounts and thresholds are compared with BigInt — exact values only; JS Number
 * appears solely in the priceImpact ratio conversion, which stays in the normalization module.
 * The slippage bound lives in jupiter-swap-tolerance.js, the route rules in
 * jupiter-swap-route.js.
 */

/**
 * Echo checks hold the provider to the exact requested pair, amount, and tolerance.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {string | undefined}
 */
const echoRejection = (quote, request) => {
  if (quote.inputMint !== request.inputMint || quote.outputMint !== request.outputMint) {
    return "echoed mints did not match the requested pair";
  }
  if (quote.inAmount !== request.amount)
    return "echoed inAmount did not match the requested amount";
  if (quote.slippageBps !== request.slippageBps) {
    return "echoed slippageBps did not match the requested tolerance";
  }
  return undefined;
};

/**
 * A missing minimum output or price impact is never replaced with a fabricated value.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const presenceRejection = (quote) => {
  if (quote.otherAmountThreshold === undefined) {
    return "response had no otherAmountThreshold; the minimum output is never fabricated";
  }
  if (quote.priceImpact === undefined) return "response had no priceImpact";
  return undefined;
};

/**
 * Output and minimum output must be decimal base-unit integers, and the minimum can never
 * exceed the output it is derived from.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const outputRejection = (quote) => {
  if (!POSITIVE_BASE_UNITS.test(quote.outAmount)) {
    return "response outAmount was not a positive integer base-unit string";
  }
  const threshold = /** @type {string} */ (quote.otherAmountThreshold);
  if (!BASE_UNITS.test(threshold)) {
    return "response otherAmountThreshold was not a base-unit integer string";
  }
  if (BigInt(threshold) > BigInt(quote.outAmount)) {
    return "minimum output exceeded the quoted output";
  }
  return undefined;
};

/**
 * Envelope-level invariants for a 200 quote-only response, in assertion order.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @param {import("@solos/core").SwapQuoteRequest} request
 * @returns {string | undefined} the fixed reason, or undefined when the response is acceptable
 */
export const envelopeRejection = (quote, request) => {
  if (quote.transaction !== null) return "quote-only response carried a non-null transaction";
  if (quote.router !== "metis")
    return "response was routed by a router outside the Metis-only restriction";
  if (quote.swapMode !== "ExactIn") return "response was not an ExactIn quote";
  return (
    echoRejection(quote, request) ??
    presenceRejection(quote) ??
    outputRejection(quote) ??
    toleranceRejection(quote)
  );
};
