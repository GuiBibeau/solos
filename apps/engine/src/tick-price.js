// @ts-check
import { plainDecimal } from "@solos/core/strategy";
import { Effect } from "effect";

/**
 * @typedef {{
 *   readonly getPrice: (
 *     mint: string,
 *   ) => import("effect").Effect.Effect<{ readonly priceUsd: string; readonly at: number }, unknown>;
 * }} PriceReader
 * @typedef {{
 *   readonly load: (
 *     id: string,
 *   ) => import("effect").Effect.Effect<import("@solos-sh/actions").Strategy | undefined>;
 * }} StrategyLoad
 */

/**
 * @param {{ readonly feed: PriceReader; readonly strategies: StrategyLoad }} sources
 * @param {{ readonly strategyId: string }} request
 */
export const quotePrice = (sources, request) =>
  Effect.gen(function* () {
    const strategy = yield* sources.strategies.load(request.strategyId);
    if (strategy === undefined || strategy.kind !== "trigger") {
      return yield* Effect.fail({
        reason: "price observation requires a trigger strategy",
        remedy: "register a trigger strategy before reading its price",
      });
    }
    const priced = yield* sources.feed.getPrice(strategy.params.observe.price).pipe(Effect.either);
    if (priced._tag === "Left") return yield* Effect.fail(feedFailure(priced.left));
    const priceUsd = plainDecimal(priced.right.priceUsd);
    if (priceUsd === undefined) return yield* Effect.fail(unreadablePrice());
    return { ...priced.right, priceUsd };
  });

const unreadablePrice = () => ({
  reason: "price observation is not a decimal string",
  remedy: "retry when the price feed returns a USD price",
});

/** @param {unknown} error */
const feedFailure = (error) => ({
  reason: text(error, "reason", "the price feed failed"),
  remedy: text(error, "remedy", "retry when the price feed is available"),
});

/** @param {unknown} error @param {"reason" | "remedy"} key @param {string} fallback */
const text = (error, key, fallback) => {
  const value = key === "reason" ? reasonValue(error) : remedyValue(error);
  return typeof value === "string" && value.length > 0 ? value : fallback;
};

/** @param {unknown} error */
const reasonValue = (error) =>
  typeof error === "object" && error !== null && "reason" in error ? error.reason : undefined;

/** @param {unknown} error */
const remedyValue = (error) =>
  typeof error === "object" && error !== null && "remedy" in error ? error.remedy : undefined;
