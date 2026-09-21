// @ts-check
import {
  assembleState,
  BalanceReader,
  LiquidityVenue,
  LendingVenue,
  mintsToPrice,
  PerpVenue,
  PortfolioReader,
  PriceFeed,
} from "@solos/core";
import { Effect, Layer } from "effect";

/**
 * The portfolio read model over the composed read ports (ADR-0018). The wallet read and all
 * three venue enumerations must succeed — any failure propagates typed and no state is
 * assembled. Missing prices degrade only valuation: the holding keeps its amount with a null
 * value and the aggregate NAV becomes null. Orca is the one implemented liquidity venue.
 * A factory, not a singleton: each composition binds its own build.
 */
export const PortfolioReaderLive = () =>
  Layer.effect(
    PortfolioReader,
    Effect.gen(function* () {
      const balances = yield* BalanceReader;
      const feed = yield* PriceFeed;
      const lending = yield* LendingVenue;
      const perp = yield* PerpVenue;
      const liquidity = yield* LiquidityVenue;

      /** @param {{ readonly owner: string }} request */
      const getState = ({ owner }) =>
        Effect.gen(function* () {
          const lamports = yield* balances.getLamports(owner);
          const tokenBalances = yield* balances.getTokenBalances(owner);
          const venues = {
            lend: yield* lending.listPositions(owner),
            perp: yield* perp.listPositions(owner),
            liquidity: yield* liquidity.listPositions({ protocol: "orca", owner }),
          };
          /** @type {Map<string, { readonly priceUsd: string }>} */
          const observed = new Map();
          const mints = mintsToPrice({ lamports, tokenBalances, venues });
          for (const mint of mints) {
            const price = yield* Effect.either(feed.getPrice(mint));
            if (price._tag === "Right") observed.set(mint, price.right);
          }
          return assembleState({
            owner,
            lamports,
            tokenBalances,
            venues,
            prices: observed,
            at: Date.now(),
          });
        });

      return { getState };
    }),
  );
