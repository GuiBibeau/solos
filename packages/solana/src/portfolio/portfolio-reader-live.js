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

/** Liquidity venues with a read adapter. Kept beside the merge it drives (#129). */
const LIQUIDITY_PROTOCOLS = /** @type {const} */ (["orca", "raydium"]);

/**
 * Enumerate every liquidity venue that has an adapter and merge the envelopes. A failure in any
 * one fails the whole read: a partial portfolio is what the contract rules out.
 * @param {import("@solos/core/liquidity").LiquidityVenueShape} liquidity
 * @param {string} owner
 */
const mergedLiquidity = (liquidity, owner) =>
  Effect.map(
    Effect.forEach(LIQUIDITY_PROTOCOLS, (protocol) =>
      liquidity.listPositions({ protocol, owner: /** @type {any} */ (owner) }),
    ),
    (envelopes) => ({
      positions: envelopes.flatMap((one) => one.positions),
      perpAccounts: envelopes.flatMap((one) => one.perpAccounts),
      receiptMints: envelopes.flatMap((one) => one.receiptMints),
    }),
  );

/**
 * The portfolio read model over the composed read ports (ADR-0018). The wallet read and all
 * three venue enumerations must succeed — any failure propagates typed and no state is
 * assembled. Missing prices degrade only valuation: the holding keeps its amount with a null
 * value and the aggregate NAV becomes null. Every liquidity venue with a read adapter is
 * enumerated and merged. A factory, not a singleton: each composition binds its own build.
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
            // Every venue with a read adapter, merged. Omitting one would make the state
            // silently under-report holdings, which CONTEXT.md's "Complete enumeration" forbids
            // — it must return all supported positions or fail explicitly.
            liquidity: yield* mergedLiquidity(liquidity, owner),
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
