// @ts-check
import { BuildRejected, NoPositionToClose } from "@solos/core";
import { Effect } from "effect";
import { readTraderRiskSnapshot } from "./phoenix-open-risk.js";

/** @typedef {import("@ellipsis-labs/rise").Trader} Trader */
/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;owner:string;trader:Trader;symbol:string;assetId:number}} Facts */

/** @param {Trader} trader @param {number} assetId */
const hasOtherChainRisk = (trader, assetId) =>
  trader.nativeSolCollateral !== 0n ||
  trader.occupiedConditionalOrderIndices.length > 0 ||
  trader.numMarketsWithSplines > 0 ||
  trader.positions.entries.some(
    ({ key, value }) =>
      key !== BigInt(assetId) &&
      (value.baseLotPosition !== 0n ||
        value.virtualQuoteLotPosition !== 0n ||
        value.accumulatedFundingForActivePosition !== 0n),
  );

/** @param {Trader} trader @param {number} assetId @param {string} symbol */
const assertChainPosition = (trader, assetId, symbol) => {
  const matching = trader.positions.entries.filter(({ key }) => key === BigInt(assetId));
  const position = matching[0];
  if (!position || position.value.baseLotPosition === 0n)
    throw new NoPositionToClose({ market: symbol });
  if (matching.length !== 1 || hasOtherChainRisk(trader, assetId))
    throw new BuildRejected({
      reason: "Phoenix close account has unsupported unrelated or pending risk",
    });
  return position.value;
};

/** @typedef {Effect.Effect.Success<ReturnType<typeof readTraderRiskSnapshot>>["snapshot"]["snapshot"]} Snapshot */
/** @typedef {Snapshot["subaccounts"][number]} Subaccount */
/** @param {Subaccount} sub */
const hasPendingApiRisk = (sub) =>
  sub.orders.length > 0 ||
  sub.splines.length > 0 ||
  sub.triggers.length > 0 ||
  sub.spotCollaterals.length > 0;

/** @param {Snapshot} snapshot @param {Trader} trader */
const assertApiScope = (snapshot, trader) => {
  const sub = snapshot.subaccounts[0];
  if (
    !sub ||
    snapshot.subaccounts.length !== 1 ||
    sub.subaccountIndex !== 0 ||
    !snapshot.capabilities.capabilities.placeMarketOrder.immediate ||
    hasPendingApiRisk(sub) ||
    BigInt(sub.collateral) !== BigInt(trader.state.quoteLotCollateral)
  )
    throw new BuildRejected({ reason: "Phoenix close all-market account risk cannot be verified" });
  return sub;
};

/** @param {Subaccount} sub @param {string} symbol */
const hasOtherApiPosition = (sub, symbol) =>
  sub.positions.some(
    (row) =>
      row.symbol !== symbol &&
      (BigInt(row.basePositionLots) !== 0n ||
        BigInt(row.virtualQuotePositionLots) !== 0n ||
        BigInt(row.unsettledFundingQuoteLots) !== 0n),
  );

/** @param {{snapshot:Snapshot;symbol:string;position:import("@ellipsis-labs/rise").TraderPosition;trader:Trader}} facts */
const assertApiPosition = ({ snapshot, symbol, position, trader }) => {
  const sub = assertApiScope(snapshot, trader);
  const positions = sub.positions.filter((row) => row.symbol === symbol);
  if (positions.length !== 1 || hasOtherApiPosition(sub, symbol))
    throw new BuildRejected({ reason: "Phoenix close all-market positions are incomplete" });
  const row = positions[0];
  if (
    !row ||
    BigInt(row.basePositionLots) !== position.baseLotPosition ||
    BigInt(row.virtualQuotePositionLots) !== position.virtualQuoteLotPosition ||
    BigInt(row.positionSequenceNumber) !== BigInt(position.positionSequenceNumber)
  )
    throw new BuildRejected({ reason: "Phoenix close position disagrees with on-chain state" });
};

/** Check the signed target size against the fresh all-market API and on-chain Trader.
 * No generic opposite-side open can pass this gate or manufacture a closed fill.
 * @param {Facts} facts */
export const readCloseRisk = ({ config, ctx, owner, trader, symbol, assetId }) =>
  Effect.gen(function* () {
    const position = yield* Effect.try({
      try: () => assertChainPosition(trader, assetId, symbol),
      catch: (error) =>
        error instanceof NoPositionToClose || error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix close on-chain position is unknown" }),
    });
    const { snapshot, slot } = yield* readTraderRiskSnapshot(config, ctx, owner);
    yield* Effect.try({
      try: () => assertApiPosition({ snapshot: snapshot.snapshot, symbol, position, trader }),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix close API position cannot be verified" }),
    });
    return { positionLots: position.baseLotPosition, slot };
  });
