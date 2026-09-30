// @ts-check
import { BASE_UNITS } from "./jupiter-swap-quote.js";

/**
 * Route rules for the Jupiter Swap V2 quote-only response: only what a usable route needs,
 * nothing about traversal order — Metis splits and merges at intermediate stages. Hops carry
 * typed positive amounts; every hop must be executable from the echoed input mint
 * (reachability fixpoint over the route's own hops, so no hop is disconnected or alien), and
 * the echoed output mint must be produced. Terminal hops (those ending at the echoed output,
 * position-independent so merges work) must jointly produce at least the quoted net output:
 * fees legitimately make gross exceed net, so equality is not required — but gross below net
 * is impossible.
 */

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
 * Terminal coverage: what the route leaves in the output mint — every hop producing it, minus
 * every hop that consumes it again on the way — must be at least the quoted net output. Fees
 * make gross exceed net (live: gross 1059158 vs net 1058947), so equality is not required, but a
 * net flow below the quote is impossible. Counting only production would let a pass-through hop
 * (out to the output mint, then back in) satisfy the check with output the taker never keeps.
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope["routePlan"]} hops
 * @param {import("./jupiter-swap-quote.js").JupiterQuoteEnvelope} quote
 * @returns {string | undefined}
 */
const terminalRejection = (hops, quote) => {
  let net = 0n;
  for (const hop of hops) {
    if (hop.swapInfo.outputMint === quote.outputMint) net += BigInt(hop.swapInfo.outAmount);
    if (hop.swapInfo.inputMint === quote.outputMint) net -= BigInt(hop.swapInfo.inAmount);
  }
  return net >= BigInt(quote.outAmount)
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
