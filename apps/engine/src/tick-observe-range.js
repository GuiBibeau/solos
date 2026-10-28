// @ts-check
import { positionValueUsd } from "@solos/core/strategy";
import { Effect } from "effect";

/**
 * Pool, position, and token prices for a range tick. A missing position still returns
 * the pool so evaluate can fail the tick for a missing range.
 * @param {RangeSources} sources
 * @param {{ readonly strategyId: string; readonly instant: number }} request
 */
export const readRange = (sources, request) =>
  Effect.gen(function* () {
    const strategy = yield* sources.strategies.load(request.strategyId);
    if (strategy === undefined || strategy.kind !== "range") return yield* missingStrategy();
    const pool = yield* sources.liquidity.getPool({
      protocol: "meteora",
      pool: strategy.params.pool,
    });
    const owner = yield* sources.signer.address();
    const read = yield* sources.liquidity
      .getPosition({ protocol: "meteora", position: strategy.params.position, owner })
      .pipe(Effect.either);
    const prices = yield* tokenPrices(sources.feed, [pool.tokenA.mint, pool.tokenB.mint]);
    const position = read._tag === "Right" ? read.right : undefined;
    return observed({ request, pool, position, prices });
  });

/**
 * @typedef {{
 *   readonly signer: SignerReader;
 *   readonly feed: { getPrice: (mint: string) => import("effect").Effect.Effect<{ priceUsd: string }, unknown> };
 *   readonly strategies: { load: (id: string) => import("effect").Effect.Effect<import("@solos-sh/actions").Strategy | undefined> };
 *   readonly liquidity: import("@solos/core/liquidity").LiquidityVenueShape;
 * }} RangeSources
 * @typedef {{ address: () => import("effect").Effect.Effect<string, unknown> }} SignerReader
 */

/** @param {RangeSources["feed"]} feed @param {readonly string[]} mints */
const tokenPrices = (feed, mints) =>
  Effect.gen(function* () {
    const first = yield* onePrice(feed, mints[0] ?? "");
    const second = yield* onePrice(feed, mints[1] ?? "");
    return /** @type {readonly [string, string]} */ ([first, second]);
  });

/** @param {RangeSources["feed"]} feed @param {string} mint */
const onePrice = (feed, mint) =>
  Effect.gen(function* () {
    const priced = yield* feed.getPrice(mint).pipe(Effect.either);
    if (priced._tag === "Left") return "";
    return priced.right.priceUsd;
  });

/**
 * @param {{
 *   request: { instant: number };
 *   pool: import("@solos/core/liquidity").PoolState;
 *   position: import("@solos-sh/actions").Position | undefined;
 *   prices: readonly [string, string];
 * }} input
 */
const observed = (input) => {
  const bins = binIds(input.position);
  const amounts = amountsOf(input.position);
  return {
    instant: input.request.instant,
    activeId: input.pool.activeId,
    binStep: input.pool.binStep,
    tokenAMint: input.pool.tokenA.mint,
    tokenADecimals: input.pool.tokenA.decimals,
    tokenBMint: input.pool.tokenB.mint,
    tokenBDecimals: input.pool.tokenB.decimals,
    priceAPerB: input.pool.priceAPerB,
    poolAt: input.pool.at,
    position: input.position?.kind === "lp" ? input.position.position : "",
    lowerBinId: bins.lower,
    upperBinId: bins.upper,
    amountA: amounts.amountA,
    amountB: amounts.amountB,
    valueUsd: positionValueUsd([
      { amount: amounts.amountA, decimals: input.pool.tokenA.decimals, price: input.prices[0] },
      { amount: amounts.amountB, decimals: input.pool.tokenB.decimals, price: input.prices[1] },
    ]),
    priceA: input.prices[0],
    priceB: input.prices[1],
  };
};

/** @param {import("@solos-sh/actions").Position | undefined} position */
const binIds = (position) => {
  const range = position?.kind === "lp" ? position.range : undefined;
  if (range === undefined || !("lowerBinId" in range)) return { lower: "", upper: "" };
  return { lower: range.lowerBinId, upper: range.upperBinId };
};

/** @param {import("@solos-sh/actions").Position | undefined} position */
const amountsOf = (position) => {
  if (position?.kind !== "lp") return { amountA: "0", amountB: "0" };
  return { amountA: position.tokenA.amount, amountB: position.tokenB.amount };
};

const missingStrategy = () =>
  Effect.fail({
    reason: "range strategy is not loaded",
    remedy: "register a range strategy before the tick reads the pool",
  });
