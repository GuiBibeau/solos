// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { executionResult, simulationResult } from "../executor/action-results.js";
import { simulateDraft, submitDraft } from "../submission/submission.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { buildOpen } from "./phoenix-open-build.js";
import { readOpenRisk } from "./phoenix-open-risk.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape;submission:import("../submission/submission.js").SubmissionDeps}} Deps */
/** @typedef {Extract<import("@solos-sh/actions").Action,{type:"open_perp"}>} OpenAction */
/** @typedef {Effect.Effect.Success<ReturnType<typeof buildOpen>>} Plan */

/**
 * What must still hold right before an IOC open is sent: the build is fresh, the trader has not
 * moved, and the risk read is still inside the order's slot window. Submission runs this after
 * simulation and rechecks the lifetime after it.
 * @param {Deps} deps @param {Plan} plan
 */
const openGuard = (deps, plan) =>
  Effect.gen(function* () {
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
    const simulated = yield* simulateDraft(deps.submission, { draft: plan.draft });
    return simulationResult(action, simulated, null);
  });

/** @param {Deps} deps @param {OpenAction} action @param {{skipSimulation:boolean}} options */
export const executeOpen = (deps, action, options) =>
  Effect.gen(function* () {
    const plan = yield* buildOpen(deps, action);
    const delivered = yield* submitDraft(
      deps.submission,
      { draft: plan.draft, guard: openGuard(deps, plan) },
      options,
    );
    return yield* executionResult(action, delivered);
  });
