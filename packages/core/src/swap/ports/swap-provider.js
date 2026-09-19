// @ts-check
import { Context } from "effect";

/**
 * An aggregator or DEX quote source. The first adapter is Jupiter Swap API V2, quote-only.
 * Execution never runs through this port: execute-tier use cases build an `Action` and call the
 * shared `ActionExecutor`, which obtains a fresh build per call (ADR-0013).
 * @typedef {{
 *   readonly name: string;
 *   readonly quote: (request: import("../domain/types.js").SwapQuoteRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").SwapQuote,
 *       import("../domain/errors.js").SwapQuoteError
 *     >;
 * }} SwapProviderShape
 */

export const SwapProvider = /** @type {Context.Tag<SwapProviderShape, SwapProviderShape>} */ (
  Context.GenericTag("@solos/swap/SwapProvider")
);
