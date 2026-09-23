// @ts-check
/**
 * The seam between this package and the klend-sdk for deposits: the only file the deposit
 * build touches SDK values through. Resolves the configured market's float-rate reserve
 * for the action's mint directly from the candidate's decoded bytes, and distills it into
 * plain facts — including the predicted collateral receipt from the pinned exchange-rate
 * math at the current ledger instant. A market/reserve that fails correspondence is a
 * `BuildRejected` value: the intent never becomes bytes (ADR-0019 — the executor
 * revalidates identity against its configuration).
 */
import { BuildRejected, RpcError } from "@solos/core";
import { Effect } from "effect";
import {
  KaminoMarketOwnerError,
  sdkFloatRateReserveForMint,
  sdkLedgerInstant,
  sdkLendingMarketAuthority,
} from "./kamino-rpc-seam.js";

/** @type {Promise<typeof import("@kamino-finance/klend-sdk")> | undefined} */
let sdkPromise;

/** The pinned official instruction builders and math for the deposit plan (SDK artifacts). */
export const kaminoDepositSdk = () => {
  sdkPromise ??= import("@kamino-finance/klend-sdk");
  return sdkPromise;
};

/** @typedef {{ rpc: import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>; url: string }} DepositRead */
/** @typedef {import("./kamino-rpc-seam.js").LedgerInstant} LedgerInstant */
/** @typedef {NonNullable<Awaited<ReturnType<typeof sdkFloatRateReserveForMint>>>} SdkReserve */

/**
 * Read-tier typed failures are executor rejections here: configuration drift or a reserve
 * the configured market does not carry. Transport stays `RpcError`; everything else
 * rejects the build — the intent never becomes bytes.
 * @param {unknown} error
 * @returns {BuildRejected | RpcError}
 */
const asExecutorFailure = (error) => {
  if (error instanceof RpcError) return error;
  if (error instanceof KaminoMarketOwnerError) {
    return new BuildRejected({
      reason: "the configured market account is not owned by the pinned lending program",
    });
  }
  if (error instanceof BuildRejected) return error;
  return new BuildRejected({
    reason: error instanceof Error ? error.message : "the deposit facts could not be resolved",
  });
};

/**
 * The float-rate reserve for the action's mint, with the market's presence already
 * enforced. `null` (market missing) and `undefined` (mint not carried) become rejections.
 * @param {DepositRead} read @param {{ readonly market: string; readonly mint: string }} target
 * @returns {import("effect").Effect.Effect<SdkReserve, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
const reserveFor = (read, target) =>
  Effect.flatMap(
    Effect.tryPromise({
      try: () => sdkFloatRateReserveForMint(read.rpc, target.market, target.mint),
      catch: (error) =>
        error instanceof KaminoMarketOwnerError
          ? new BuildRejected({
              reason: "the configured market account is not owned by the pinned lending program",
            })
          : new RpcError({
              method: "reserve-read",
              url: read.url,
              reason: error instanceof Error ? error.message : "unknown read failure",
            }),
    }),
    (reserve) => {
      if (reserve === null) {
        return Effect.fail(
          new BuildRejected({
            reason: "the configured lending market account is missing on the configured RPC",
          }),
        );
      }
      if (reserve === undefined) {
        return Effect.fail(
          new BuildRejected({
            reason: "the configured market has no float-rate reserve for this mint",
          }),
        );
      }
      return Effect.succeed(reserve);
    },
  );

/** @param {string} value */
const oracleOrNull = (value) =>
  value === "11111111111111111111111111111111" ||
  value === "nu11111111111111111111111111111111111111111"
    ? null
    : value;

/**
 * The plain facts one deposit plan needs: derived reserve identities under the pinned
 * program, the authority PDA, and the pinned-math collateral estimate at the read instant.
 * @param {{ readonly reserve: SdkReserve; readonly instant: LedgerInstant; readonly market: string; readonly amount: bigint }} parts
 * @returns {Promise<import("./kamino-deposit-plan.js").ReserveFacts>}
 */
const factsOf = async ({ reserve, instant, market, amount }) => {
  const sdk = /** @type {any} */ (await kaminoDepositSdk());
  // The repo's LedgerInstant is structurally identical to the SDK's branded one.
  const exchangeRate = reserve.getEstimatedCollateralExchangeRate(/** @type {any} */ (instant), 0);
  const amountDecimal = sdk.numberToLamportsDecimal(amount.toString(), 0);
  const estimatedCollateral = sdk.KaminoReserve.liquidityToCTokens(
    amountDecimal,
    exchangeRate,
  ).floor();
  return {
    reserve: reserve.address.toString(),
    liquidityMint: reserve.getLiquidityMint().toString(),
    liquiditySupplyVault: reserve.state.liquidity.supplyVault.toString(),
    liquidityTokenProgram: reserve.getLiquidityTokenProgram().toString(),
    collateralMint: reserve.getCTokenMint().toString(),
    collateralSupplyVault: reserve.state.collateral.supplyVault.toString(),
    lendingMarketAuthority: await sdkLendingMarketAuthority(market),
    estimatedCollateral: estimatedCollateral.toString(),
    exchangeRate: exchangeRate.toString(),
    availableLiquidity: reserve.state.liquidity.totalAvailableAmount.toString(),
    farmCollateral: oracleOrNull(reserve.state.farmCollateral.toString()),
    oracles: {
      pythOracle: oracleOrNull(reserve.state.config.tokenInfo.pythConfiguration.price.toString()),
      switchboardPriceOracle: oracleOrNull(
        reserve.state.config.tokenInfo.switchboardConfiguration.priceAggregator.toString(),
      ),
      switchboardTwapOracle: oracleOrNull(
        reserve.state.config.tokenInfo.switchboardConfiguration.twapAggregator.toString(),
      ),
      scopePrices: oracleOrNull(
        reserve.state.config.tokenInfo.scopeConfiguration.priceFeed.toString(),
      ),
    },
  };
};

/**
 * Resolve the deposit's chain facts for one action: the configured market's float-rate
 * reserve for the mint, its derived addresses, and the pinned-math collateral estimate.
 * @param {DepositRead} read
 * @param {{ readonly market: string; readonly mint: string; readonly amount: bigint }} action
 * @returns {import("effect").Effect.Effect<import("./kamino-deposit-plan.js").ReserveFacts, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
export const depositFacts = (read, action) =>
  Effect.gen(function* () {
    const reserve = yield* reserveFor(read, action);
    const instant = yield* Effect.tryPromise({
      try: () => sdkLedgerInstant(read.rpc),
      catch: (error) =>
        new RpcError({
          method: "getSlot",
          url: read.url,
          reason: error instanceof Error ? error.message : "unknown read failure",
        }),
    });
    return yield* Effect.promise(() =>
      factsOf({ reserve, instant, market: action.market, amount: action.amount }),
    );
  }).pipe(
    Effect.catchAll((error) => Effect.fail(asExecutorFailure(error))),
    Effect.withSpan("lend.depositFacts"),
  );
