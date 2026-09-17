// @ts-check
import { Effect } from "effect";
import { NewsInputSchema, SummaryInputSchema, TrendingInputSchema } from "../domain/discovery.js";
import { IrisInputInvalid } from "../domain/errors.js";
import { MarketIntelligence } from "../ports/market-intelligence.js";

/** @param {import("../domain/discovery.js").TrendingInput} input */
export const getTrendingTokens = (input) =>
  Effect.gen(function* () {
    const parsed = TrendingInputSchema.safeParse(input);
    if (!parsed.success)
      return yield* new IrisInputInvalid({
        reason: "Invalid trending window, pagination, or mention threshold",
      });
    return yield* (yield* MarketIntelligence).trending(parsed.data);
  }).pipe(Effect.withSpan("market.getTrendingTokens"));

/** @param {import("../domain/discovery.js").NewsInput} input */
export const getTokenNews = (input) =>
  Effect.gen(function* () {
    const parsed = NewsInputSchema.safeParse(input);
    if (!parsed.success)
      return yield* new IrisInputInvalid({
        reason: "Provide 1–10 coin IDs and valid news window/pagination",
      });
    return yield* (yield* MarketIntelligence).news(parsed.data);
  }).pipe(Effect.withSpan("market.getTokenNews"));

/** @param {import("../domain/discovery.js").SummaryInput} input */
export const getEventSummary = (input) =>
  Effect.gen(function* () {
    const parsed = SummaryInputSchema.safeParse(input);
    if (!parsed.success)
      return yield* new IrisInputInvalid({
        reason: "Provide 1–10 keywords, a valid window, and searchType and/or",
      });
    return yield* (yield* MarketIntelligence).summary(parsed.data);
  }).pipe(Effect.withSpan("market.getEventSummary"));
