// @ts-check
import { BASE_UNITS, POSITIVE_BASE_UNITS } from "./jupiter-swap-quote.js";
import { toleranceRejection } from "./jupiter-swap-tolerance.js";

/**
 * Intent checks for one Jupiter V2 build: the provider must echo the exact requested pair,
 * amount, and tolerance, and the minimum output is never fabricated and sits inside the same
 * BigInt tolerance bound the quote face enforces. Every check returns a fixed reason string;
 * no provider text travels into errors. Amounts are compared with BigInt, never a JS Number.
 */

/**
 * Echo checks hold the provider to the exact requested pair, amount, and tolerance.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 */
export const echoRejection = (envelope, action) => {
  if (envelope.inputMint !== action.inputMint || envelope.outputMint !== action.outputMint) {
    return "echoed mints did not match the requested pair";
  }
  if (envelope.inAmount !== action.amount) {
    return "echoed inAmount did not match the requested amount";
  }
  if (envelope.slippageBps !== action.maxSlippageBps) {
    return "echoed slippageBps did not match the requested tolerance";
  }
  if (envelope.swapMode !== "ExactIn") return "response was not an ExactIn swap";
  return undefined;
};

/**
 * The minimum output is never fabricated and must sit inside the same BigInt tolerance bound
 * the quote face enforces: floor(out × (10000−bps)/10000) ≤ threshold ≤ out.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const minOutRejection = (envelope) => {
  if (envelope.otherAmountThreshold === undefined) {
    return "response had no otherAmountThreshold; the minimum output is never fabricated";
  }
  if (!POSITIVE_BASE_UNITS.test(envelope.outAmount)) {
    return "response outAmount was not a positive integer base-unit string";
  }
  if (!BASE_UNITS.test(envelope.otherAmountThreshold)) {
    return "response otherAmountThreshold was not a base-unit integer string";
  }
  if (BigInt(envelope.otherAmountThreshold) > BigInt(envelope.outAmount)) {
    return "minimum output exceeded the quoted output";
  }
  return toleranceRejection(/** @type {any} */ (envelope));
};
