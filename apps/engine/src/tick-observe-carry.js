// @ts-check
import { normalizeMarketSymbol } from "@solos/core/perp";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect } from "effect";

/**
 * Funding, Phoenix account, balances, and USD prices for one carry tick.
 * The spot mint's USD price is the mark: the funding snapshot does not publish one.
 * @param {CarrySources} sources
 * @param {{ readonly strategyId: string; readonly instant: number }} request
 */
export const readCarry = (sources, request) =>
  Effect.gen(function* () {
    const strategy = yield* sources.strategies.load(request.strategyId);
    if (strategy === undefined || strategy.kind !== "carry") return yield* missingStrategy();
    const owner = yield* sources.signer.address();
    const market = yield* marketOf(strategy.params.market);
    const funding = yield* fundingOf(sources.perp, market, strategy.params.lookbackHours);
    const account = yield* accountOf(sources.perp, market, owner);
    const onboarded = yield* onboardedOf(sources.onboarder, owner);
    const spot = yield* holding(sources, owner, strategy.params.spotMint);
    const quote = yield* holding(sources, owner, strategy.params.quoteMint);
    const spotPrice = yield* priceOf(sources.feed, strategy.params.spotMint);
    const quotePrice = yield* priceOf(sources.feed, strategy.params.quoteMint);
    return packed({
      request,
      strategy,
      funding,
      account,
      onboarded,
      spot,
      quote,
      spotPrice,
      quotePrice,
    });
  });

/**
 * @typedef {{
 *   readonly signer: { address: () => import("effect").Effect.Effect<string, unknown> };
 *   readonly balances: import("@solos/core/wallet").BalanceReaderShape;
 *   readonly feed: { getPrice: (mint: string) => import("effect").Effect.Effect<{ priceUsd: string }, unknown> };
 *   readonly perp: import("@solos/core/perp").PerpVenueShape;
 *   readonly onboarder: import("@solos/core/perp").PerpOnboarderShape;
 *   readonly decimals: import("@solos/core/strategy").MintDecimalsShape;
 *   readonly strategies: { load: (id: string) => import("effect").Effect.Effect<import("@solos-sh/actions").Strategy | undefined> };
 * }} CarrySources
 */

/** @param {string} text */
const marketOf = (text) =>
  Effect.try({
    try: () => normalizeMarketSymbol(text),
    catch: (error) => explained(error, "market symbol is not a Phoenix ticker"),
  });

/**
 * @param {CarrySources["perp"]} perp
 * @param {string} market
 * @param {number} lookbackHours
 */
const fundingOf = (perp, market, lookbackHours) =>
  perp
    .getFunding({ market, lookbackHours })
    .pipe(Effect.mapError((error) => explained(error, "Phoenix funding did not answer")));

/**
 * @param {CarrySources["perp"]} perp
 * @param {string} market
 * @param {string} owner
 */
const accountOf = (perp, market, owner) =>
  perp
    .getPosition({ market, owner: /** @type {import("@solos-sh/actions").Address} */ (owner) })
    .pipe(Effect.mapError((error) => explained(error, "Phoenix trader state did not answer")));

/**
 * A status read that fails counts as not onboarded so evaluate can name the remedy.
 * @param {CarrySources["onboarder"]} onboarder
 * @param {string} owner
 */
const onboardedOf = (onboarder, owner) =>
  Effect.gen(function* () {
    const status = yield* onboarder.status(owner).pipe(Effect.either);
    if (status._tag === "Left") return 0;
    return status.right.state === "ready" ? 1 : 0;
  });

/**
 * @param {CarrySources} sources
 * @param {string} owner
 * @param {string} mint
 */
const holding = (sources, owner, mint) =>
  Effect.gen(function* () {
    const tokens = yield* sources.balances.getTokenBalances(
      /** @type {import("@solos-sh/actions").Address} */ (owner),
    );
    const row = tokens.find((token) => token.mint === mint);
    const amount = yield* amountOf(sources, { owner, mint, amount: row?.amount ?? "0" });
    const read = yield* sources.decimals.decimalsOf(mint);
    return { amount, decimals: read ?? row?.decimals ?? 0 };
  });

/**
 * @param {CarrySources} sources
 * @param {{ owner: string; mint: string; amount: string }} held
 */
const amountOf = (sources, held) =>
  Effect.gen(function* () {
    if (held.mint !== WSOL_MINT) return held.amount;
    const lamports = yield* sources.balances.getLamports(
      /** @type {import("@solos-sh/actions").Address} */ (held.owner),
    );
    return (BigInt(held.amount) + lamports).toString();
  });

/** @param {CarrySources["feed"]} feed @param {string} mint */
const priceOf = (feed, mint) =>
  Effect.gen(function* () {
    const priced = yield* feed.getPrice(mint).pipe(Effect.either);
    if (priced._tag === "Left") return "";
    return priced.right.priceUsd;
  });

/**
 * @param {{
 *   request: { instant: number };
 *   strategy: import("@solos-sh/actions").Strategy & { kind: "carry" };
 *   funding: import("@solos/core/perp").FundingSnapshot;
 *   account: import("@solos/core/perp").GetPositionResult;
 *   onboarded: number;
 *   spot: { amount: string; decimals: number };
 *   quote: { amount: string; decimals: number };
 *   spotPrice: string;
 *   quotePrice: string;
 * }} input
 */
const packed = (input) => ({
  instant: input.request.instant,
  currentAprPct: input.funding.aprPct,
  markPriceUsd: input.spotPrice,
  fundingAt: input.funding.at,
  fundingHistory: JSON.stringify(input.funding.history),
  perpSide: input.account.position.side,
  perpSize: input.account.position.amount,
  perpNotionalUsd: "",
  onboarded: input.onboarded,
  equityUsd: input.account.account.equityUsd ?? "",
  freeCollateralUsd: "",
  spotBalance: input.spot.amount,
  spotDecimals: input.spot.decimals,
  quoteBalance: input.quote.amount,
  quoteDecimals: input.quote.decimals,
  spotPriceUsd: input.spotPrice,
  quotePriceUsd: input.quotePrice,
  quoteMint: input.strategy.params.quoteMint,
});

/** @param {unknown} error @param {string} fallback */
const explained = (error, fallback) => ({
  reason: reasonText(error) ?? fallback,
  remedy: remedyText(error) ?? "retry when Phoenix answers",
});

/** @param {unknown} error */
const reasonText = (error) => {
  if (typeof error !== "object" || error === null || !("reason" in error)) return undefined;
  const value = /** @type {{ reason?: unknown }} */ (error).reason;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** @param {unknown} error */
const remedyText = (error) => {
  if (typeof error !== "object" || error === null || !("remedy" in error)) return undefined;
  const value = /** @type {{ remedy?: unknown }} */ (error).remedy;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const missingStrategy = () =>
  Effect.fail({
    reason: "carry strategy is not loaded",
    remedy: "register a carry strategy before the tick reads funding",
  });
