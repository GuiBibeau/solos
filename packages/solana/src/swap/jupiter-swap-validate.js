// @ts-check
/**
 * Contract validation for the Jupiter Swap V2 quote-only response, split out of the
 * normalization module. Every check returns a fixed reason string; raw bodies, route entries,
 * and the API key never travel into errors. Amounts, thresholds, and route bounds are compared
 * with BigInt — exact values only. JS Number appears solely in the priceImpact ratio conversion,
 * which stays in the normalization module.
 *
 * Slippage rule the tolerance check enforces: the requested tolerance is a maximum loss, so the
 * echoed `slippageBps` must equal the request and the threshold must satisfy
 * `floor(outAmount * (10000 - slippageBps) / 10000) <= otherAmountThreshold <= outAmount`,
 * with the verified Jupiter integer rounding (floor division; live examples compute
 * `floor(netOut * 9950 / 10000)` at 50 bps). A threshold above the floor is more protective
 * than requested and stays allowed; a threshold below it means the provider allows more
 * slippage than requested and is rejected. At 0 bps the bound collapses to equality.
 *
 * Route rule the plan checks enforce: only what a usable route needs, nothing about traversal
 * order — Metis splits and merges at intermediate stages. Hops carry typed positive amounts;
 * every hop must be executable from the echoed input mint (reachability fixpoint over the
 * route's own hops, so no hop is disconnected or alien), and the echoed output mint must be
 * produced. Terminal hops (those ending at the echoed output, position-independent so merges
 * work) must jointly produce at least the quoted net output: fees legitimately make gross
 * exceed net, so equality is not required — but gross below net is impossible.
 */

const BASE_UNITS = /^\d+$/;
const POSITIVE_BASE_UNITS = /^[1-9]\d*$/;

/**
 * Exact output floor at the requested tolerance, BigInt floor division.
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
 * The tolerance is a maximum loss: the threshold must protect at least the requested worst
 * case. Below the floor the provider allows more slippage than requested; at 0 bps the bound
 * collapses to equality with the output.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const toleranceRejection = (quote) => {
  const floor = worstCaseFor(quote.outAmount, quote.slippageBps);
  if (BigInt(/** @type {string} */ (quote.otherAmountThreshold)) < floor) {
    return "minimum output was below the exact worst case for the requested slippage tolerance";
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
 * One relaxation pass; adds newly reachable outputs and reports whether anything changed.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {Set<string>} reachable
 */
const relaxOnce = (hops, reachable) => {
  let didChange = false;
  for (const hop of hops) {
    if (!reachable.has(hop.swapInfo.inputMint) || reachable.has(hop.swapInfo.outputMint)) {
      continue;
    }

    reachable.add(hop.swapInfo.outputMint);
    didChange = true;
  }
  return didChange;
};

/**
 * Mints reachable from the echoed input through the route's own hops — an order-independent
 * fixpoint, so splits and merges at intermediate stages need no adjacency assumptions.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {string} inputMint
 * @returns {Set<string>}
 */
const reachableMints = (hops, inputMint) => {
  const reachable = new Set([inputMint]);
  let didChange = true;
  while (didChange) {
    didChange = relaxOnce(hops, reachable);
  }
  return reachable;
};

/**
 * Reachability: the echoed output must be produced, and every hop must execute from the input
 * side — no disconnected or alien hops. No ordering, allocation, or restart rules are imposed.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const reachabilityRejection = (hops, quote) => {
  const reachable = reachableMints(hops, quote.inputMint);
  if (!reachable.has(quote.outputMint)) return "route never reaches the output mint";
  for (const hop of hops) {
    if (!reachable.has(hop.swapInfo.inputMint)) {
      return "route contained a hop disconnected from the input mint";
    }
  }
  return undefined;
};

/**
 * Terminal coverage: hops ending at the echoed output must jointly produce at least the quoted
 * net output — fees make gross exceed net (live: gross 1059158 vs net 1058947), so equality is
 * not required, but gross below net is impossible.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const terminalRejection = (hops, quote) => {
  let gross = 0n;
  for (const hop of hops) {
    if (hop.swapInfo.outputMint === quote.outputMint) {
      gross += BigInt(hop.swapInfo.outAmount);
    }
  }
  return gross >= BigInt(quote.outAmount)
    ? undefined
    : "route terminal output was below the quoted output";
};

/**
 * Route-level invariants for a non-empty plan: typed positive hops, requested-pair
 * reachability, and terminal output coverage.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined} the fixed reason, or undefined when the route is usable
 */
export const routeRejection = (quote) => {
  const hops = quote.routePlan;
  if (hops[0] === undefined) return undefined;
  for (const hop of hops) {
    const rejected = hopRejection(hop);
    if (rejected) return rejected;
  }
  return reachabilityRejection(hops, quote) ?? terminalRejection(hops, quote);
};
