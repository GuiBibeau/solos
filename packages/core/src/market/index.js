// @ts-check
/** @typedef {import("./domain/errors.js").IrisError} IrisError */
/** @typedef {import("./domain/errors.js").PriceFeedError} PriceFeedError */
/** @typedef {import("./domain/types.js").AskIrisInput} AskIrisInput */
/** @typedef {import("./domain/types.js").GetPriceInput} GetPriceInput */
/** @typedef {import("./domain/types.js").MarketAnswer} MarketAnswer */
/** @typedef {import("./ports/market-intelligence.js").MarketIntelligenceShape} MarketIntelligenceShape */
export {
  IrisAuthFailed,
  IrisConfigMissing,
  IrisHttpError,
  IrisInputInvalid,
  IrisNetworkError,
  IrisQuestionInvalid,
  IrisRateLimited,
  IrisResponseInvalid,
  IrisTimeout,
  PriceAuthFailed,
  PriceConfigMissing,
  PriceHttpError,
  PriceInputInvalid,
  PriceNetworkError,
  PriceRateLimited,
  PriceResponseInvalid,
  PriceTimeout,
  PriceUnavailable,
  UnknownToken,
} from "./domain/errors.js";
export {
  AskIrisInputSchema,
  GetPriceInputSchema,
  MarketAnswerSchema,
  TokenMetadataSchema,
  TokenPriceSchema,
} from "./domain/types.js";
export { MarketIntelligence } from "./ports/market-intelligence.js";
export { PriceFeed } from "./ports/price-feed.js";
export { TokenRegistry } from "./ports/token-registry.js";
export { askIris } from "./use-cases/ask-iris.js";
export { getPrice } from "./use-cases/get-price.js";
export { askIrisTool } from "./tools/ask-iris.js";
export { getPriceTool } from "./tools/get-price.js";

import { askIrisTool } from "./tools/ask-iris.js";
import { eventSummaryTool, tokenNewsTool, trendingTokensTool } from "./tools/discovery.js";
import { getPriceTool } from "./tools/get-price.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const marketTools = [
  askIrisTool,
  trendingTokensTool,
  tokenNewsTool,
  eventSummaryTool,
  getPriceTool,
];

export * from "./domain/discovery.js";
export { getEventSummary, getTokenNews, getTrendingTokens } from "./use-cases/discovery.js";
