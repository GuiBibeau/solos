// @ts-check
import { Context } from "effect";

/**
 * An aggregator or DEX. The first adapter is Jupiter Swap API V2, quote-only.
 * @typedef {{
 *   readonly name: string;
 *   readonly quote: (request: import("../domain/types.js").SwapQuoteRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").SwapQuote,
 *       import("../domain/errors.js").SwapQuoteError
 *     >;
 *   readonly execute: (quote: import("../domain/types.js").SwapQuote, options: { skipSimulation: boolean }) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").SwapReceipt,
 *       import("../domain/errors.js").SwapFailed | import("../domain/errors.js").QuoteExpired | import("../../shared/domain/errors.js").RpcError
 *     >;
 * }} SwapProviderShape
 */

export const SwapProvider = /** @type {Context.Tag<SwapProviderShape, SwapProviderShape>} */ (
  Context.GenericTag("@solos/swap/SwapProvider")
);
