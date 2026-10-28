// @ts-check
import { PriceFeed, PriceUnavailable, compareDecimal } from "@solos/core";
import {
  MintDecimals,
  SpendMeter,
  UnsupportedStrategyAction,
  actualUsdFor,
  isLiquidityAction,
  mintOf,
  reserveUsdFor,
  unsupportedStrategyAction,
  usdForLamports,
} from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";
import { quoteLiquidity } from "./tick-spend-liquidity.js";

/** Worst-case reservation from the price feed and the mint's verified decimals. */
export const liveSpendMeter = Layer.effect(
  SpendMeter,
  Effect.gen(function* () {
    const feed = yield* PriceFeed;
    const decimals = yield* MintDecimals;
    return { quote: (action, context) => quoteAction({ feed, decimals }, action, context) };
  }),
);

/**
 * A transfer holds principal plus its builder fee. A swap holds the input at max slippage
 * plus the fee the built transaction can cost. Any other kind is refused. A nonpositive
 * price is PriceUnavailable. Unverified swap decimals are not priced.
 * @param {QuoteDeps} deps
 * @param {import("@solos-sh/actions").Action} action
 * @param {import("@solos/core/strategy").SpendContext | undefined} context
 */
const quoteAction = (deps, action, context) =>
  Effect.gen(function* () {
    const refused = unsupportedStrategyAction(action.type);
    if (refused !== undefined) return yield* refused;
    if (isLiquidityAction(action.type)) return yield* quoteLiquidity(deps, action, context);
    const mint = mintOf(action);
    const price = yield* deps.feed.getPrice(mint);
    if (!isPositive(price.priceUsd)) return yield* missingPrice(mint, price.source);
    return yield* quotePriced(deps, action, { mint, priceUsd: price.priceUsd });
  });

/**
 * @typedef {{
 *   getPrice: (mint: string) => import("effect").Effect.Effect<
 *     { priceUsd: string; source: string },
 *     unknown,
 *     never
 *   >;
 * }} PriceReader
 * @typedef {{ readonly feed: PriceReader; readonly decimals: import("@solos/core/strategy").MintDecimalsShape }} QuoteDeps
 * @typedef {{ readonly mint: string; readonly priceUsd: string }} Priced
 */

/**
 * @param {QuoteDeps} deps
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const quotePriced = (deps, action, priced) => {
  if (action.type === "transfer_sol") return Effect.succeed(transferQuote(action, priced));
  if (action.type === "swap") return swapQuote(deps, action, priced);
  return Effect.fail(new UnsupportedStrategyAction({ type: action.type }));
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
 * @param {QuoteDeps} deps
 * @param {import("@solos-sh/actions").Action} action
 * @param {Priced} priced
 */
const swapQuote = (deps, action, priced) =>
  Effect.gen(function* () {
    const sol = yield* solPriceFor(deps.feed, priced);
    if (!isPositive(sol.priceUsd)) return yield* missingPrice(WSOL_MINT, sol.source);
    const decimals = yield* deps.decimals.decimalsOf(priced.mint);
    if (decimals === undefined) return unverifiedQuote(priced.mint);
    return yield* swapPriced({ action, priced, solPriceUsd: sol.priceUsd, decimals });
  });

/**
 * @param {{
 *   action: import("@solos-sh/actions").Action;
 *   priced: Priced;
 *   solPriceUsd: string;
 *   decimals: number;
 * }} input
 */
const swapPriced = (input) =>
  Effect.gen(function* () {
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), input.solPriceUsd);
    if (feeUsd === undefined) return yield* missingPrice(WSOL_MINT, "price-feed");
    const priced = { priceUsd: input.priced.priceUsd, decimals: input.decimals, feeUsd };
    return {
      reserveUsd: reserveUsdFor(input.action, priced),
      actualUsd: actualUsdFor(input.action, priced),
      mint: input.priced.mint,
      solPriceUsd: input.solPriceUsd,
    };
  });

/** @param {string} mint */
const unverifiedQuote = (mint) => ({
  reserveUsd: "0",
  actualUsd: "0",
  mint,
  unverified: /** @type {const} */ (true),
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
