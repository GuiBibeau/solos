// @ts-check
import { Context } from "effect";

/**
 * Market intelligence: Chat, trending tokens, token news, and event summaries. Adapters live
 * in packages/solana; the core never sees HTTP or keys.
 * @typedef {{
 *   readonly ask: (question: string) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").MarketAnswer, import("../domain/errors.js").IrisError>;
 *   readonly trending: (input: import("../domain/discovery.js").TrendingInput) => import("effect").Effect.Effect<import("../domain/discovery.js").TrendingResult, import("../domain/errors.js").IrisError>;
 *   readonly news: (input: import("../domain/discovery.js").NewsInput) => import("effect").Effect.Effect<import("../domain/discovery.js").NewsResult, import("../domain/errors.js").IrisError>;
 *   readonly summary: (input: import("../domain/discovery.js").SummaryInput) => import("effect").Effect.Effect<import("../domain/discovery.js").SummaryResult, import("../domain/errors.js").IrisError>;
 * }} MarketIntelligenceShape
 */

export const MarketIntelligence =
  /** @type {Context.Tag<MarketIntelligenceShape, MarketIntelligenceShape>} */ (
    Context.GenericTag("@solos/market/MarketIntelligence")
  );
