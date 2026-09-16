// @ts-check
import { Context } from "effect";

/**
 * An aggregator or DEX (Jupiter first). No adapter exists yet.
 * @typedef {{
 *   readonly name: string;
 *   readonly quote: (request: import("../domain/types.js").SwapQuoteRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").SwapQuote,
 *       import("../domain/errors.js").NoRouteFound | import("../../shared/domain/errors.js").RpcError
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
