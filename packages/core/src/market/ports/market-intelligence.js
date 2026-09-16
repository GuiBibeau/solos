// @ts-check
import { Context } from "effect";

/**
 * Market intelligence: one written answer per question, powered by Elfa's Iris. Adapters live
 * in packages/solana; the core never sees HTTP or keys.
 * @typedef {{
 *   readonly ask: (question: string) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").MarketAnswer, import("../domain/errors.js").IrisError>;
 * }} MarketIntelligenceShape
 */

export const MarketIntelligence =
  /** @type {Context.Tag<MarketIntelligenceShape, MarketIntelligenceShape>} */ (
    Context.GenericTag("@solos/market/MarketIntelligence")
  );
