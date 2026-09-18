// @ts-check
/** @typedef {import("./domain/errors.js").SwapQuoteError} SwapQuoteError */
/** @typedef {import("./domain/types.js").SwapQuote} SwapQuote */
/** @typedef {import("./domain/types.js").SwapQuoteRequest} SwapQuoteRequest */
export {
  NoRouteFound,
  QuoteAuthFailed,
  QuoteConfigMissing,
  QuoteExpired,
  QuoteHttpError,
  QuoteInputInvalid,
  QuoteNetworkError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
  SwapFailed,
} from "./domain/errors.js";
export { SwapQuoteRequestSchema, SwapQuoteSchema, SwapReceiptSchema } from "./domain/types.js";
export { SwapProvider } from "./ports/swap-provider.js";
export { executeSwap } from "./use-cases/execute-swap.js";
export { getQuote } from "./use-cases/get-quote.js";
export { getQuoteTool } from "./tools/get-quote.js";

import { getQuoteTool } from "./tools/get-quote.js";

/**
 * Quote-only today: the port-required execute fails fast until Action-based build execution
 * lands (#18). The Jupiter adapter Layer fails pre-HTTP without JUPITER_API_KEY, so unrelated
 * tool discovery never breaks.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const swapTools = [getQuoteTool];
