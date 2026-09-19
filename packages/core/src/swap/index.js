// @ts-check
/** @typedef {import("./domain/errors.js").SwapQuoteError} SwapQuoteError */
/** @typedef {import("./domain/types.js").SwapQuote} SwapQuote */
/** @typedef {import("./domain/types.js").SwapQuoteRequest} SwapQuoteRequest */
/** @typedef {import("./domain/types.js").SwapSimulation} SwapSimulation */
/** @typedef {import("./domain/types.js").SwapExecution} SwapExecution */
export {
  NoRouteFound,
  QuoteAuthFailed,
  QuoteConfigMissing,
  QuoteHttpError,
  QuoteInputInvalid,
  QuoteNetworkError,
  QuoteRateLimited,
  QuoteResponseInvalid,
  QuoteTimeout,
} from "./domain/errors.js";
export {
  SwapExecutionSchema,
  SwapQuoteRequestSchema,
  SwapQuoteSchema,
  SwapSimulationSchema,
} from "./domain/types.js";
export { SwapProvider } from "./ports/swap-provider.js";
export { executeSwap } from "./use-cases/execute-swap.js";
export { getQuote } from "./use-cases/get-quote.js";
export { simulateSwap } from "./use-cases/simulate-swap.js";
export { executeSwapTool } from "./tools/execute-swap.js";
export { getQuoteTool } from "./tools/get-quote.js";
export { simulateSwapTool } from "./tools/simulate-swap.js";

import { executeSwapTool } from "./tools/execute-swap.js";
import { getQuoteTool } from "./tools/get-quote.js";
import { simulateSwapTool } from "./tools/simulate-swap.js";

/**
 * Quote, simulate, and execute: quote stays read-only and indicative, while the simulate and
 * execute twins go through the shared ActionExecutor, which fetches a fresh Jupiter build per
 * call. The Jupiter layers fail pre-HTTP without JUPITER_API_KEY, so unrelated tool discovery
 * never breaks.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const swapTools = [getQuoteTool, simulateSwapTool, executeSwapTool];
