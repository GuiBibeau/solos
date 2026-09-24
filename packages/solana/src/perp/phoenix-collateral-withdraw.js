// @ts-check
import { BuildRejected, BuildUnavailable, PerpStateIncomplete } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { TRADER_STATE_PATH } from "./phoenix-api.js";
import { validateWithdrawalState } from "./phoenix-collateral-risk.js";
import { phoenixOnboardGet } from "./phoenix-onboard-api.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {{ config: import("./phoenix-api.js").PhoenixConfig; ctx: Rpc; owner: string; trader: import("@ellipsis-labs/rise").Trader }} Facts */

/** @param {Facts["trader"]} trader */
const assertOnchainFlat = (trader) => {
  if (
    trader.occupiedConditionalOrderIndices.length > 0 ||
    trader.numMarketsWithSplines > 0 ||
    trader.positions.entries.some(
      ({ value }) =>
        value.baseLotPosition !== 0n ||
        value.virtualQuoteLotPosition !== 0n ||
        value.accumulatedFundingForActivePosition !== 0n,
    )
  )
    throw new BuildRejected({ reason: "on-chain Phoenix trader has active or unsettled exposure" });
};

/** @param {Facts} facts */
const fetchRisk = ({ config, ctx, owner }) =>
  Effect.gen(function* () {
    const currentSlot = yield* rpcCall("getSlot", ctx.url, () =>
      ctx.rpc.getSlot({ commitment: "confirmed" }).send(),
    );
    const outcome = yield* Effect.tryPromise({
      try: () => phoenixOnboardGet(config, `${TRADER_STATE_PATH}/${encodeURIComponent(owner)}`),
      catch: () =>
        new BuildUnavailable({ reason: "Phoenix all-market risk snapshot is unavailable" }),
    });
    if (outcome.status !== 200)
      return yield* new BuildUnavailable({
        reason: `Phoenix risk snapshot HTTP ${outcome.status}`,
      });
    return { currentSlot, body: outcome.body };
  });

/** @param {Facts} facts */
export const assertWithdrawalReady = (facts) =>
  Effect.gen(function* () {
    yield* Effect.try({
      try: () => assertOnchainFlat(facts.trader),
      catch: () =>
        new BuildRejected({ reason: "on-chain Phoenix trader has active or unsettled exposure" }),
    });
    const { body, currentSlot } = yield* fetchRisk(facts);
    const collateral = yield* Effect.try({
      try: () =>
        validateWithdrawalState(body, {
          owner: facts.owner,
          currentSlot: Number(currentSlot),
          withdrawQueueNode: facts.trader.withdrawQueueNode,
        }),
      catch: (error) =>
        new BuildRejected({
          reason:
            error instanceof BuildRejected || error instanceof PerpStateIncomplete
              ? error.reason
              : "Phoenix risk snapshot cannot prove a flat and settled trader",
        }),
    });
    if (BigInt(collateral) !== BigInt(facts.trader.state.quoteLotCollateral))
      return yield* new BuildRejected({
        reason: "Phoenix API collateral disagrees with on-chain trader state",
      });
    return BigInt(collateral);
  });
