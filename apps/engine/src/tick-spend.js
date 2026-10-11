// @ts-check
import { PriceFeed, PriceUnavailable, compareDecimal } from "@solos/core";
import {
  SpendMeter,
  actualUsdFor,
  mintOf,
  reserveUsdFor,
  usdForLamports,
} from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";

/** Flat buffer for an Action whose builder fee is not known here. Swaps do not use it. */
const OTHER_FEE_USD = "0.50";

/** Worst-case reservation from the price feed. Tests inject a scripted meter instead. */
export const liveSpendMeter = Layer.effect(
  SpendMeter,
  Effect.gen(function* () {
    const feed = yield* PriceFeed;
    return { quote: (action) => quoteAction(feed, action) };
  }),
);

/**
 * A transfer holds principal plus its builder fee. A swap holds the input at max slippage
 * plus the fee the built transaction can cost, both at this read. A nonpositive price is
 * PriceUnavailable and reserves nothing.
 * @param {PriceReader} feed
 * @param {import("@solos-sh/actions").Action} action
 */
const quoteAction = (feed, action) =>
  Effect.gen(function* () {
    const mint = mintOf(action);
    const price = yield* feed.getPrice(mint);
    if (!isPositive(price.priceUsd)) return yield* missingPrice(mint, price.source);
    return yield* quotePriced(feed, action, { mint, priceUsd: price.priceUsd });
  });

/**
 * @typedef {{
 *   getPrice: (mint: string) => import("effect").Effect.Effect<
 *     { priceUsd: string; source: string },
 *     unknown,
 *     never
 *   >;
 * }} PriceReader
 * @typedef {{ readonly mint: string; readonly priceUsd: string }} Priced
 */

/**
 * @param {PriceReader} feed
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const quotePriced = (feed, action, priced) => {
  if (action.type === "transfer_sol") return Effect.succeed(transferQuote(action, priced));
  if (action.type === "swap") return swapQuote(feed, action, priced);
  return Effect.succeed(otherQuote(action, priced));
};

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const transferQuote = (action, priced) => {
  const lamports = action.type === "transfer_sol" ? action.lamports : "0";
  const notionalUsd = transferNotionalUsd(lamports, priced.priceUsd) ?? "0";
  return { reserveUsd: notionalUsd, actualUsd: notionalUsd, mint: priced.mint };
};

/**
 * @param {PriceReader} feed
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const swapQuote = (feed, action, priced) =>
  Effect.gen(function* () {
    const sol = yield* solPriceFor(feed, priced);
    if (!isPositive(sol.priceUsd)) return yield* missingPrice(WSOL_MINT, sol.source);
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), sol.priceUsd);
    if (feeUsd === undefined) return yield* missingPrice(WSOL_MINT, sol.source);
    return {
      reserveUsd: reserveUsdFor(action, priced.priceUsd, feeUsd),
      actualUsd: actualUsdFor(action, priced.priceUsd),
      mint: priced.mint,
      solPriceUsd: sol.priceUsd,
    };
  });

/**
 * The input mint's price covers the fee when the input is SOL. Any other input still
 * prices the fee in SOL, from the same feed.
 * @param {PriceReader} feed
 * @param {Priced} priced
 */
const solPriceFor = (feed, priced) => {
  if (priced.mint === WSOL_MINT)
    return Effect.succeed({ priceUsd: priced.priceUsd, source: "price-feed" });
  return feed.getPrice(WSOL_MINT);
};

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const otherQuote = (action, priced) => ({
  reserveUsd: reserveUsdFor(action, priced.priceUsd, OTHER_FEE_USD),
  actualUsd: actualUsdFor(action, priced.priceUsd),
  mint: priced.mint,
});

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
