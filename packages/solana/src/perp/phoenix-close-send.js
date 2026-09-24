// @ts-check
import { signature as checkedSignature } from "@solana/kit";
import { BuildRejected, SimulationFailed } from "@solos/core";
import { Clock, Effect } from "effect";
import { simulationErrorText } from "../executor/simulation-error-text.js";
import { recheckSignedSwapLifetime } from "../executor/swap-preflight.js";
import { sendSigned, simulateSigned } from "../executor/transfer-sol.js";
import { buildClose } from "./phoenix-close-build.js";
import { readCloseRisk } from "./phoenix-close-risk.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {Extract<import("@solos/actions").Action,{type:"close_perp"}>} CloseAction */
/** @typedef {Effect.Effect.Success<ReturnType<typeof buildClose>>} Plan */

/** @param {Deps} deps @param {Plan} plan */
const recheckClose = (deps, plan) =>
  Effect.gen(function* () {
    yield* recheckSignedSwapLifetime(deps.ctx, plan.signed);
    const { owner, state, market, risk, order, symbol, startedAt } = plan.facts;
    if (Date.now() - startedAt > 5000)
      return yield* new BuildRejected({ reason: "Phoenix close build expired before submission" });
    const current = yield* readCollateralTrader(deps.ctx, owner);
    if (
      current.state.sequenceNumber.sequenceNumber !== state.sequenceNumber.sequenceNumber ||
      current.state.sequenceNumber.lastUpdateSlot !== state.sequenceNumber.lastUpdateSlot
    )
      return yield* new BuildRejected({
        reason: "Phoenix trader changed after close simulation; nothing was sent",
      });
    const latest = yield* readCloseRisk({
      config: deps.config,
      ctx: deps.ctx,
      owner,
      trader: current.state,
      symbol,
      assetId: market.assetId,
    });
    if (
      latest.positionLots !== risk.positionLots ||
      latest.slot < risk.slot ||
      latest.slot > order.lastValidSlot ||
      Date.now() - startedAt > 5000
    )
      return yield* new BuildRejected({
        reason: "Phoenix reduce-only position or expiry changed before submission",
      });
  });

/** @param {Deps} deps @param {CloseAction} action */
export const simulateClose = (deps, action) =>
  Effect.gen(function* () {
    const plan = yield* buildClose(deps, action);
    const raw = yield* simulateSigned(deps.ctx, plan.signed);
    const isOk = raw.err === null;
    return {
      action,
      ok: isOk,
      unitsConsumed: raw.unitsConsumed,
      logs: raw.logs,
      projectedPortfolio: null,
      venueQuote: null,
      violations: isOk ? [] : [{ rule: "simulation", message: simulationErrorText(raw.err) }],
    };
  });

/** @param {Deps} deps @param {CloseAction} action @param {{skipSimulation:boolean}} options */
export const executeClose = (deps, action, options) =>
  Effect.gen(function* () {
    const plan = yield* buildClose(deps, action);
    if (!options.skipSimulation) {
      const raw = yield* simulateSigned(deps.ctx, plan.signed);
      if (raw.err !== null)
        return yield* new SimulationFailed({
          reason: simulationErrorText(raw.err),
          logs: raw.logs,
        });
    }
    yield* recheckClose(deps, plan);
    const signature = checkedSignature(yield* sendSigned(deps.ctx, plan.signed));
    return {
      action,
      status: /** @type {const} */ ("confirmed"),
      signature,
      executedAt: yield* Clock.currentTimeMillis,
      simulated: !options.skipSimulation,
      error: null,
    };
  });
