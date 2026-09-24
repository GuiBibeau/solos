// @ts-check
import { signature as checkedSignature } from "@solana/kit";
import { BuildRejected, SimulationFailed } from "@solos/core";
import { Clock, Effect } from "effect";
import { simulationErrorText } from "../executor/simulation-error-text.js";
import { recheckSignedSwapLifetime } from "../executor/swap-preflight.js";
import { sendSigned, simulateSigned } from "../executor/transfer-sol.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { buildOpen } from "./phoenix-open-build.js";
import { readOpenRisk } from "./phoenix-open-risk.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {Extract<import("@solos/actions").Action,{type:"open_perp"}>} OpenAction */
/** @typedef {Effect.Effect.Success<ReturnType<typeof buildOpen>>} Plan */

/** @param {Deps} deps @param {Plan} plan */
const recheckOpen = (deps, plan) =>
  Effect.gen(function* () {
    yield* recheckSignedSwapLifetime(deps.ctx, plan.signed);
    const { owner, state, order, observedSlot, startedAt } = plan.facts;
    if (Date.now() - startedAt > 5000)
      return yield* new BuildRejected({
        reason: "Phoenix open build state expired before submission",
      });
    const current = yield* readCollateralTrader(deps.ctx, owner);
    if (
      current.state.sequenceNumber.sequenceNumber !== state.sequenceNumber.sequenceNumber ||
      current.state.sequenceNumber.lastUpdateSlot !== state.sequenceNumber.lastUpdateSlot
    )
      return yield* new BuildRejected({
        reason: "Phoenix trader changed after simulation; nothing was sent",
      });
    const risk = yield* readOpenRisk({
      config: deps.config,
      ctx: deps.ctx,
      owner,
      trader: current.state,
    });
    if (
      risk.collateral !== plan.facts.risk.collateral ||
      risk.slot < observedSlot ||
      risk.slot > order.lastValidSlot ||
      Date.now() - startedAt > 5000
    )
      return yield* new BuildRejected({
        reason: "Phoenix IOC state or expiry changed before submission",
      });
  });

/** @param {Deps} deps @param {OpenAction} action */
export const simulateOpen = (deps, action) =>
  Effect.gen(function* () {
    const plan = yield* buildOpen(deps, action);
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

/** @param {Deps} deps @param {OpenAction} action @param {{skipSimulation:boolean}} options */
export const executeOpen = (deps, action, options) =>
  Effect.gen(function* () {
    const plan = yield* buildOpen(deps, action);
    if (!options.skipSimulation) {
      const raw = yield* simulateSigned(deps.ctx, plan.signed);
      if (raw.err !== null)
        return yield* new SimulationFailed({
          reason: simulationErrorText(raw.err),
          logs: raw.logs,
        });
    }
    yield* recheckOpen(deps, plan);
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
