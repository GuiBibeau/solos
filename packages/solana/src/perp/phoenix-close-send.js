// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { executionResult, simulationResult } from "../executor/action-results.js";
import { simulateSigned, submitSigned } from "../submission/submission.js";
import { buildClose } from "./phoenix-close-build.js";
import { readCloseRisk } from "./phoenix-close-risk.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape;submission:import("../submission/submission.js").SubmissionDeps}} Deps */
/** @typedef {Extract<import("@solos/actions").Action,{type:"close_perp"}>} CloseAction */
/** @typedef {Effect.Effect.Success<ReturnType<typeof buildClose>>} Plan */

/**
 * What must still hold right before a reduce-only close is sent: the build is fresh, the trader
 * has not moved, and the position and slot window match what was simulated. Submission runs
 * this after simulation and rechecks the lifetime after it.
 * @param {Deps} deps @param {Plan} plan
 */
const closeGuard = (deps, plan) =>
  Effect.gen(function* () {
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
    const simulated = yield* simulateSigned(deps.submission, { signed: plan.signed });
    return simulationResult(action, simulated, null);
  });

/** @param {Deps} deps @param {CloseAction} action @param {{skipSimulation:boolean}} options */
export const executeClose = (deps, action, options) =>
  Effect.gen(function* () {
    const plan = yield* buildClose(deps, action);
    const delivered = yield* submitSigned(
      deps.submission,
      { signed: plan.signed, guard: closeGuard(deps, plan) },
      options,
    );
    return yield* executionResult(action, delivered);
  });
