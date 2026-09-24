// @ts-check
import { PHOENIX_PERPS_PROGRAM } from "./phoenix-api.js";

/**
 * Canned, documented-shape bodies for the loopback Phoenix fixture. Numbers and lot strings
 * mirror the pinned Rise revision: quote lots at 1e-6 USDC, signed base-lot strings, market
 * metadata carrying `baseLotsDecimals`.
 */

/** The System Program: a valid 32-byte base58 address standing in for a trader authority. */
export const DEFAULT_AUTHORITY = "11111111111111111111111111111111";
/** The wSOL mint: a second valid address, used as a mismatching authority echo. */
export const OTHER_AUTHORITY = "So11111111111111111111111111111111111111112";

export const SOL_MARKET = marketConfig("SOL", 2);
export const ETH_MARKET = marketConfig("ETH", 3);
export const DEFAULT_MARKETS = [SOL_MARKET, ETH_MARKET];

/**
 * Realistic `ExchangeMarketConfig` subset with the documented extension fields present.
 * @param {string} symbol
 * @param {number} baseLotsDecimals
 */
export function marketConfig(symbol, baseLotsDecimals) {
  return {
    symbol,
    assetId: 0,
    marketStatus: "active",
    metadata: `Phoenix ${symbol}-PERP`,
    marketPubkey: PHOENIX_PERPS_PROGRAM,
    splinePubkey: PHOENIX_PERPS_PROGRAM,
    tickSize: 100,
    baseLotsDecimals,
    takerFee: 0.00035,
    makerFee: 0.0001,
    leverageTiers: [{ maxPositionNotionalQuoteLots: "1000000000", maxLeverage: 20 }],
    riskFactors: { marginMaintenance: 0.05, marginInitial: 0.1 },
  };
}

/**
 * One trader-state position row, deprecated trigger arrays included and ignored.
 * @param {string} symbol
 * @param {string} basePositionLots
 */
export function positionRow(symbol, basePositionLots) {
  return {
    symbol,
    positionSequenceNumber: "1",
    basePositionLots,
    basePositionUnits: "1500",
    entryPriceTicks: "15000",
    entryPriceUsd: "150",
    virtualQuotePositionLots: "0",
    unsettledFundingQuoteLots: "0",
    accumulatedFundingQuoteLots: "0",
    takeProfitTriggers: [],
    stopLossTriggers: [],
    conditionalTakeProfitTriggers: [],
    conditionalStopLossTriggers: [],
  };
}

/** @param {number} subaccountIndex @param {{ collateral?: string; spotCollaterals?: unknown[]; positions?: unknown[] }} [overrides] */
export function subaccount(subaccountIndex, overrides = {}) {
  return {
    subaccountIndex,
    sequence: 0,
    collateral: overrides.collateral ?? "250000000",
    spotCollaterals: overrides.spotCollaterals ?? [],
    positions: overrides.positions ?? [],
    orders: [],
    splines: [],
    triggers: [],
  };
}

/** @param {string} authority @param {unknown[]} subaccounts @param {"uninitialized" | "cold" | "active" | "reduceOnly" | "frozen"} [state] */
export function traderState(authority, subaccounts, state = "active") {
  return {
    authority,
    traderPdaIndex: 0,
    slot: 448_348_464,
    slotIndex: 1355,
    snapshot: {
      version: 1,
      capabilities: { flags: 62, state, capabilities: {} },
      makerFeeOverrideMultiplier: 1,
      takerFeeOverrideMultiplier: 1,
      subaccounts,
    },
  };
}

/** A valid market with no registered trader: cold, empty, zero collateral.
 * @param {string} authority
 */
export const coldState = (authority) =>
  traderState(authority, [subaccount(0, { collateral: "0" })], "cold");

/** One open long: 1500 base lots at 2 decimals = 15 SOL.
 * @param {string} [authority]
 */
export const longState = (authority = DEFAULT_AUTHORITY) =>
  traderState(authority, [subaccount(0, { positions: [positionRow("SOL", "1500")] })]);

/** One open short: the sign is the only direction signal on the wire.
 * @param {string} [authority]
 */
export const shortState = (authority = DEFAULT_AUTHORITY) =>
  traderState(authority, [subaccount(0, { positions: [positionRow("SOL", "-1500")] })]);

/** An active trader with collateral and no open market.
 * @param {string} [authority]
 */
export const flatState = (authority = DEFAULT_AUTHORITY) => traderState(authority, [subaccount(0)]);

/** Open positions in two markets; subaccounts arrive out of index order on purpose.
 * @param {string} [authority]
 */
export const multiMarketState = (authority = DEFAULT_AUTHORITY) =>
  traderState(authority, [
    subaccount(1, { collateral: "0" }),
    subaccount(0, {
      positions: [positionRow("SOL", "1500"), positionRow("ETH", "-1000")],
    }),
  ]);
