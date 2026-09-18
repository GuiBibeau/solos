// @ts-check
/**
 * Contract validation for the Jupiter Swap V2 quote-only response, split out of the
 * normalization module. Every check returns a fixed reason string; raw bodies, route entries,
 * and the API key never travel into errors. Amounts, thresholds, and route bounds are compared
 * with BigInt — exact values only. JS Number appears solely in the priceImpact ratio conversion,
 * which stays in the normalization module.
 *
 * Slippage rule the tolerance check assumes: the echoed `slippageBps` must equal the request,
 * and `otherAmountThreshold` is the worst case at that tolerance — the provider computes
 * `floor(outAmount * (10000 - slippageBps) / 10000)` with integer rounding and may apply
 * *additional* protective slippage in volatility (threshold lower), never less than requested.
 * A threshold above that exact floor, or above the quoted output, is rejected.
 *
 * Route rule the plan checks assume: `routePlan` is a depth-first walk. A hop with
 * `bps < 10000` starts a branch over from the input mint; a hop with `bps = 10000` continues
 * from the previous hop's output. The branch-starting hops (the first hop and every hop with
 * `bps < 10000`) carry the input allocation: their bps must sum to 10000 and their inputs must
 * consume the whole quoted input exactly.
 */

const BASE_UNITS = /^\d+$/;
const POSITIVE_BASE_UNITS = /^[1-9]\d*$/;

/**
 * Exact worst case at the requested tolerance, BigInt floor division.
 * @param {string} outAmount
 * @param {number} slippageBps
 */
const worstCaseFor = (outAmount, slippageBps) =>
  (BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n;

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
 * The minimum output may sit below the exact tolerance worst case (extra protective slippage)
 * but never above it; boundary tolerances pin the bound (0 bps -> at most the output,
 * 10000 bps -> at most zero).
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const toleranceRejection = (quote) => {
  const limit = worstCaseFor(quote.outAmount, quote.slippageBps);
  if (BigInt(/** @type {string} */ (quote.otherAmountThreshold)) > limit) {
    return "minimum output was above the exact worst case for the requested slippage tolerance";
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

/**
 * One hop must carry positive base-unit amounts on both sides.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"][number]} hop
 * @returns {string | undefined}
 */
const hopRejection = (hop) => {
  const { swapInfo } = hop;
  if (!BASE_UNITS.test(swapInfo.inAmount) || BigInt(swapInfo.inAmount) === 0n) {
    return "route hop inAmount was not a positive base-unit integer";
  }
  if (!BASE_UNITS.test(swapInfo.outAmount) || BigInt(swapInfo.outAmount) === 0n) {
    return "route hop outAmount was not a positive base-unit integer";
  }
  return undefined;
};

/**
 * Consecutive hops must chain mint-to-mint and amount-to-amount within a branch, and a new
 * branch must start over from the input mint.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"][number]} previous
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"][number]} next
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 */
const pairRejection = (previous, next, quote) => {
  if (next.bps === 10_000) {
    if (next.swapInfo.inputMint !== previous.swapInfo.outputMint) {
      return "route hops did not chain mint to mint";
    }
    if (BigInt(next.swapInfo.inAmount) !== BigInt(previous.swapInfo.outAmount)) {
      return "route hops did not chain amount to amount";
    }
    return undefined;
  }
  return next.swapInfo.inputMint === quote.inputMint
    ? undefined
    : "split route branch did not start from the input mint";
};

/**
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 */
const pairsRejection = (hops, quote) => {
  let previous;
  for (const hop of hops) {
    if (previous !== undefined) {
      const rejected = pairRejection(previous, hop, quote);
      if (rejected) return rejected;
    }
    previous = hop;
  }
  return undefined;
};

/**
 * Branch-starting hops must allocate the whole swap: bps summing to 10000 and inputs that
 * consume the quoted input exactly.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const allocationRejection = (hops, quote) => {
  const first = hops[0];
  if (first === undefined) return undefined;
  let allocation = first.bps;
  let consumed = BigInt(first.swapInfo.inAmount);
  for (let index = 1; index < hops.length; index++) {
    const hop = hops[index];
    if (hop !== undefined && hop.bps < 10_000) {
      allocation += hop.bps;
      consumed += BigInt(hop.swapInfo.inAmount);
    }
  }
  if (allocation !== 10_000) return "route allocations did not cover the whole swap";
  return consumed === BigInt(quote.inAmount)
    ? undefined
    : "route branches did not consume the whole quoted input";
};

/**
 * Route-level invariants for a non-empty plan: usable hops, endpoints at the requested pair,
 * consistent chaining, and an allocation that covers the swap.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined} the fixed reason, or undefined when the route is usable
 */
export const routeRejection = (quote) => {
  const hops = quote.routePlan;
  const first = hops[0];
  const last = hops.at(-1);
  if (first === undefined || last === undefined) return undefined;
  for (const hop of hops) {
    const rejected = hopRejection(hop);
    if (rejected) return rejected;
  }
  if (first.swapInfo.inputMint !== quote.inputMint) {
    return "route did not start from the input mint";
  }
  if (last.swapInfo.outputMint !== quote.outputMint) {
    return "route did not end at the output mint";
  }
  return allocationRejection(hops, quote) ?? pairsRejection(hops, quote);
};
