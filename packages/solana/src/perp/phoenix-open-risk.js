// @ts-check
import { BuildRejected, BuildUnavailable } from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";
import { rpcCall } from "../rpc/rpc-call.js";
import { TRADER_STATE_PATH } from "./phoenix-api.js";
import { phoenixOnboardGet } from "./phoenix-onboard-api.js";
import { hasNonZeroSpotCollateral } from "./phoenix-spot-collateral.js";

/** @typedef {import("@ellipsis-labs/rise").Trader} Trader */
/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
const Decimal = z.string().regex(/^(0|[1-9]\d*)$/);
const Signed = z.string().regex(/^-?(0|[1-9]\d*)$/);
const Access = z.object({
  placeMarketOrder: z.object({ immediate: z.boolean() }),
  riskIncreasingTrade: z.object({ immediate: z.boolean() }),
});
const Subaccount = z.object({
  subaccountIndex: z.number().int(),
  collateral: Decimal,
  // The venue sends a zero-balance native SOL spot row for every trader; only a nonzero balance is risk.
  spotCollaterals: z.array(z.unknown()).default([]),
  positions: z
    .array(
      z.object({
        symbol: z.string(),
        positionSequenceNumber: Decimal,
        basePositionLots: Signed,
        virtualQuotePositionLots: Signed,
        unsettledFundingQuoteLots: Signed,
      }),
    )
    .default([]),
  orders: z.array(z.object({ orders: z.array(z.unknown()) })).default([]),
  splines: z.array(z.unknown()).default([]),
  triggers: z.array(z.unknown()).default([]),
});
const Risk = z.object({
  authority: z.string(),
  traderPdaIndex: z.literal(0),
  slot: z.number().int().nonnegative(),
  snapshot: z.object({
    capabilities: z.object({
      state: z.enum(["active", "cold", "reduceOnly"]),
      capabilities: Access,
    }),
    subaccounts: z.array(Subaccount).min(1),
  }),
});

/** @param {Trader} trader */
const assertChainFlat = (trader) => {
  if (
    trader.occupiedConditionalOrderIndices.length > 0 ||
    trader.numMarketsWithSplines > 0 ||
    trader.nativeSolCollateral !== 0n ||
    trader.positions.entries.some(
      ({ value }) =>
        value.baseLotPosition !== 0n ||
        value.virtualQuoteLotPosition !== 0n ||
        value.accumulatedFundingForActivePosition !== 0n,
    )
  )
    throw new BuildRejected({
      reason: "Phoenix trader has on-chain exposure or pending conditional risk",
    });
};

/** @param {z.infer<typeof Subaccount>} sub */
const hasExposure = (sub) =>
  sub.orders.length > 0 ||
  sub.splines.length > 0 ||
  sub.triggers.length > 0 ||
  hasNonZeroSpotCollateral(sub.spotCollaterals) ||
  sub.positions.some(
    ({ basePositionLots, virtualQuotePositionLots, unsettledFundingQuoteLots }) =>
      BigInt(basePositionLots) !== 0n ||
      BigInt(virtualQuotePositionLots) !== 0n ||
      BigInt(unsettledFundingQuoteLots) !== 0n,
  );

/** @param {z.infer<typeof Risk>} snapshot @param {string} owner @param {bigint} slot */
const assertFreshSnapshot = (snapshot, owner, slot) => {
  if (
    snapshot.authority !== owner ||
    BigInt(snapshot.slot) > slot ||
    slot - BigInt(snapshot.slot) > 12n
  )
    throw new BuildRejected({ reason: "Phoenix open risk snapshot is stale or mismatched" });
};

/** @param {z.infer<typeof Risk>["snapshot"]} state */
const assertFlatAccess = ({ capabilities, subaccounts }) => {
  if (
    !capabilities.capabilities.placeMarketOrder.immediate ||
    !capabilities.capabilities.riskIncreasingTrade.immediate ||
    !["cold", "active"].includes(capabilities.state) ||
    subaccounts.length !== 1 ||
    subaccounts[0]?.subaccountIndex !== 0 ||
    subaccounts.some(hasExposure)
  )
    throw new BuildRejected({
      reason: "Phoenix open requires an authorized, fully flat and settled trader",
    });
};

/** @param {{snapshot:z.infer<typeof Risk>;trader:Trader;owner:string;slot:bigint}} facts */
const assertSnapshot = ({ snapshot, trader, owner, slot }) => {
  assertFreshSnapshot(snapshot, owner, slot);
  assertFlatAccess(snapshot.snapshot);
  const collateral = snapshot.snapshot.subaccounts.find(
    (sub) => sub.subaccountIndex === 0,
  )?.collateral;
  if (collateral === undefined || BigInt(collateral) !== BigInt(trader.state.quoteLotCollateral))
    throw new BuildRejected({
      reason: "Phoenix collateral snapshot disagrees with the on-chain trader",
    });
  return BigInt(collateral);
};

/** Read the complete, bounded all-market snapshot, then compare its slot to the RPC slot
 * obtained AFTER the HTTP response. No API-provided slot can certify its own freshness.
 * @param {import("./phoenix-api.js").PhoenixConfig} config @param {Rpc} ctx @param {string} owner */
export const readTraderRiskSnapshot = (config, ctx, owner) =>
  Effect.gen(function* () {
    const outcome = yield* Effect.tryPromise({
      try: () => phoenixOnboardGet(config, `${TRADER_STATE_PATH}/${encodeURIComponent(owner)}`),
      catch: () =>
        new BuildUnavailable({ reason: "Phoenix all-market trader risk is unavailable" }),
    });
    if (outcome.status !== 200)
      return yield* new BuildRejected({ reason: "Phoenix trader risk snapshot is unavailable" });
    const risk = Risk.safeParse(outcome.body);
    if (!risk.success)
      return yield* new BuildRejected({ reason: "Phoenix trader risk snapshot is incomplete" });
    const slot = yield* rpcCall("getSlot", ctx.url, () =>
      ctx.rpc.getSlot({ commitment: "confirmed" }).send(),
    );
    yield* Effect.try({
      try: () => assertFreshSnapshot(risk.data, owner, slot),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix trader risk freshness is unknown" }),
    });
    return { snapshot: risk.data, slot };
  });

/** Current read can fail closed but cannot assert full signed equity when spot or other-market
 * exposure exists. Only the zero-exposure cross-margin state has collateral == signed equity.
 * @param {{config:import("./phoenix-api.js").PhoenixConfig;ctx:Rpc;owner:string;trader:Trader}} facts */
export const readOpenRisk = ({ config, ctx, owner, trader }) =>
  Effect.gen(function* () {
    yield* Effect.try({
      try: () => assertChainFlat(trader),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix trader risk is unknown" }),
    });
    const { snapshot, slot } = yield* readTraderRiskSnapshot(config, ctx, owner);
    const collateral = yield* Effect.try({
      try: () => assertSnapshot({ snapshot, trader, owner, slot }),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix open risk cannot be verified" }),
    });
    return { collateral, slot };
  });
