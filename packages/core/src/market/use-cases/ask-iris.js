// @ts-check
import { Effect } from "effect";
import { IrisQuestionInvalid } from "../domain/errors.js";
import { AskIrisInputSchema } from "../domain/types.js";
import { MarketIntelligence } from "../ports/market-intelligence.js";

/**
 * Ask Iris one market question. Input is re-validated here so every entry point — tool, CLI,
 * harness — fails with a domain error before any provider access or credit spend.
 * @param {import("../domain/types.js").AskIrisInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").MarketAnswer,
 *   import("../domain/errors.js").IrisError,
 *   MarketIntelligenceShapeReq
 * >}
 * @typedef {import("../ports/market-intelligence.js").MarketIntelligenceShape} MarketIntelligenceShapeReq
 */
export const askIris = (input) =>
  Effect.gen(function* () {
    const parsed = AskIrisInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new IrisQuestionInvalid({
        reason: "question must be a nonempty string of at most 4000 characters",
      });
    }
    return yield* (yield* MarketIntelligence).ask(parsed.data.question);
  }).pipe(Effect.withSpan("market.askIris"));
