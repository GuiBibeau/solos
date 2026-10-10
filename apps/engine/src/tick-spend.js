// @ts-check
import { PriceFeed, PriceUnavailable, compareDecimal } from "@solos/core";
import { SpendMeter, actualUsdFor, mintOf, reserveUsdFor } from "@solos/core/strategy";
import { Effect, Layer } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";

/** Worst-case reservation from the price feed. Tests inject a scripted meter instead. */
export const liveSpendMeter = Layer.effect(
  SpendMeter,
  Effect.gen(function* () {
    const feed = yield* PriceFeed;
    return { quote: (action) => quoteAction(feed, action) };
  }),
);

/**
 * A transfer holds principal plus the fee reserve (base fee plus compute-unit price times
 * the compute-unit limit). A nonpositive price is PriceUnavailable and reserves nothing.
 * @param {{ getPrice: (mint: string) => import("effect").Effect.Effect<{ priceUsd: string; source: string }, unknown, never> }} feed
 * @param {import("@solos-sh/actions").Action} action
 */
const quoteAction = (feed, action) =>
  Effect.gen(function* () {
    const mint = mintOf(action);
    const price = yield* feed.getPrice(mint);
    if (!isPositive(price.priceUsd)) return yield* missingPrice(mint, price.source);
    return quoted(action, mint, price.priceUsd);
  });

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {string} mint
 * @param {string} priceUsd
 */
const quoted = (action, mint, priceUsd) => {
  if (action.type !== "transfer_sol") {
    return {
      reserveUsd: reserveUsdFor(action, priceUsd),
      actualUsd: actualUsdFor(action, priceUsd),
      mint,
    };
  }
  const notionalUsd = transferNotionalUsd(action.lamports, priceUsd) ?? "0";
  return { reserveUsd: notionalUsd, actualUsd: notionalUsd, mint };
};

/** @param {string} priceUsd */
const isPositive = (priceUsd) =>
  /^\d+(\.\d+)?$/u.test(priceUsd) && compareDecimal(priceUsd, "0") > 0;

/** @param {string} mint @param {string} source */
const missingPrice = (mint, source) =>
  Effect.fail(
    new PriceUnavailable({
      mint,
      source,
      reason: "price must be positive before a Strategy cap reserves",
    }),
  );
