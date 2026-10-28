// @ts-check
import { BalanceReader, PortfolioReader, PriceFeed, Signer } from "@solos/core";
import { LiquidityVenue } from "@solos/core/liquidity";
import { PerpOnboarder, PerpVenue } from "@solos/core/perp";
import { MintDecimals, ObservationReader, StrategyRepository } from "@solos/core/strategy";
import { Effect, Layer } from "effect";
import { readCarry } from "./tick-observe-carry.js";
import { readRange } from "./tick-observe-range.js";
import { readRebalance } from "./tick-observe-rebalance.js";
import { quotePrice } from "./tick-price.js";

/** Production reader: schedule lamports, the Tick instant, and a trigger's USD price. */
export const liveObservationReader = Layer.effect(
  ObservationReader,
  Effect.gen(function* () {
    const signer = yield* Signer;
    const balances = yield* BalanceReader;
    const portfolio = yield* PortfolioReader;
    const feed = yield* PriceFeed;
    const liquidity = yield* LiquidityVenue;
    const perp = yield* PerpVenue;
    const onboarder = yield* PerpOnboarder;
    const decimals = yield* MintDecimals;
    const strategies = yield* StrategyRepository;
    return {
      read: (request) =>
        readLive(
          { signer, balances, portfolio, feed, liquidity, perp, onboarder, decimals, strategies },
          request,
        ),
    };
  }),
);

/**
 * @param {{
 *   signer: import("@solos/core/wallet").SignerShape;
 *   balances: import("@solos/core/wallet").BalanceReaderShape;
 *   portfolio: import("./tick-observe-rebalance.js").PortfolioRead;
 *   feed: import("./tick-price.js").PriceReader;
 *   liquidity: import("@solos/core/liquidity").LiquidityVenueShape;
 *   perp: import("@solos/core/perp").PerpVenueShape;
 *   onboarder: import("@solos/core/perp").PerpOnboarderShape;
 *   decimals: import("@solos/core/strategy").MintDecimalsShape;
 *   strategies: import("./tick-price.js").StrategyLoad;
 * }} sources
 * @param {{ readonly names: readonly string[]; readonly strategyId: string; readonly instant: number }} request
 */
const readLive = (sources, request) =>
  Effect.gen(function* () {
    if (request.names.includes("currentAprPct")) return yield* readCarry(sources, request);
    if (request.names.includes("activeId")) return yield* readRange(sources, request);
    if (request.names.some((name) => name.startsWith("balance:"))) {
      return yield* readRebalance(sources, request);
    }
    const wantsPrice = request.names.some((name) => name === "price" || name === "priceAt");
    const quote = wantsPrice ? yield* quotePrice(sources, request) : undefined;
    /** @type {Record<string, string | number>} */
    const out = {};
    for (const name of request.names) {
      out[name] = yield* readName({ sources, name, instant: request.instant, quote });
    }
    return out;
  });

/**
 * @param {{
 *   readonly sources: {
 *     signer: import("@solos/core/wallet").SignerShape;
 *     balances: import("@solos/core/wallet").BalanceReaderShape;
 *   };
 *   readonly name: string;
 *   readonly instant: number;
 *   readonly quote: { readonly priceUsd: string; readonly at: number } | undefined;
 * }} input
 */
const readName = (input) =>
  Effect.gen(function* () {
    if (input.name === "instant") return input.instant;
    if (input.name === "lamports") return yield* lamportsOf(input.sources);
    if (input.name === "price" && input.quote !== undefined) return input.quote.priceUsd;
    if (input.name === "priceAt" && input.quote !== undefined) return input.quote.at;
    return yield* Effect.fail({
      reason: `observation ${input.name} is not produced`,
      remedy: "declare an observation this engine reader produces",
    });
  });

/**
 * @param {{
 *   signer: import("@solos/core/wallet").SignerShape;
 *   balances: import("@solos/core/wallet").BalanceReaderShape;
 * }} sources
 */
const lamportsOf = (sources) =>
  Effect.gen(function* () {
    const lamports = yield* sources.balances.getLamports(yield* sources.signer.address());
    return lamports.toString();
  });
