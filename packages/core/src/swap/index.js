// @ts-check
export { NoRouteFound, QuoteExpired, SwapFailed } from "./domain/errors.js";
export { SwapQuoteRequestSchema, SwapQuoteSchema, SwapReceiptSchema } from "./domain/types.js";
export { SwapProvider } from "./ports/swap-provider.js";
export { executeSwap } from "./use-cases/execute-swap.js";
export { getQuote } from "./use-cases/get-quote.js";

/**
 * No tools yet: registering a tool whose port has no Layer would break every entry point.
 * Tools arrive with the first SwapProvider adapter.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const swapTools = [];
