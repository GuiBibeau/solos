// @ts-check
/** @typedef {import("./domain/errors.js").IrisError} IrisError */
/** @typedef {import("./domain/types.js").AskIrisInput} AskIrisInput */
/** @typedef {import("./domain/types.js").MarketAnswer} MarketAnswer */
/** @typedef {import("./ports/market-intelligence.js").MarketIntelligenceShape} MarketIntelligenceShape */
export {
  IrisAuthFailed,
  IrisConfigMissing,
  IrisHttpError,
  IrisNetworkError,
  IrisQuestionInvalid,
  IrisRateLimited,
  IrisResponseInvalid,
  IrisTimeout,
  PriceUnavailable,
  UnknownToken,
} from "./domain/errors.js";
export {
  AskIrisInputSchema,
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

import { askIrisTool } from "./tools/ask-iris.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const marketTools = [askIrisTool];
