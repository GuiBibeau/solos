// @ts-check
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { executionResult, simulationResult } from "../executor/action-results.js";
import { simulateDraft, submitDraft } from "../submission/submission.js";
import { readOnboardingStatus } from "./perp-onboarder-live.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { buildCollateral } from "./phoenix-collateral-build.js";
import { collateralProbe } from "./phoenix-collateral-preflight.js";
import { reconcileCollateral } from "./phoenix-collateral-reconcile.js";
import { assertWithdrawalReady } from "./phoenix-collateral-withdraw.js";

/** @typedef {{config: import("./phoenix-api.js").PhoenixConfig,ctx: import("../rpc/solana-rpc.js").SolanaRpcShape,kit: import("../signer/kit-signer.js").KitSignerShape,submission: import("../submission/submission.js").SubmissionDeps}} Deps */
/** @typedef {Extract<import("@solos-sh/actions").Action, {type:"deposit_perp_collateral" | "withdraw_perp_collateral"}>} Action */
/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof buildCollateral>>} Plan */

/** @param {Deps} deps @param {Action} action */
const checkRegistration = (deps, action) =>
  Effect.gen(function* () {
    const status = yield* readOnboardingStatus(deps.config, deps.kit.signer.address).pipe(
      Effect.mapError(
        () => new BuildRejected({ reason: "Phoenix trader enrollment cannot be verified" }),
      ),
    );
    if (status.state === "unregistered")
      return yield* new BuildRejected({
        reason: "Enroll the current wallet's Phoenix trader before managing collateral",
      });
    if (
      action.type === "deposit_perp_collateral" &&
      status.state === "partial" &&
      status.missing.some((label) => label.endsWith(".depositCollateral"))
    )
      return yield* new BuildRejected({
        reason: "Phoenix depositCollateral permission is not enabled for the current trader",
      });
  });

/** @param {Deps} deps @param {Action} action */
const planCollateral = (deps, action) =>
  Effect.gen(function* () {
    yield* checkRegistration(deps, action);
    return yield* buildCollateral(deps, action);
  });

/**
 * What must still hold right before a collateral transfer is sent: the trader has not moved,
 * and a withdrawal is still ready. Submission rechecks the lifetime after it.
 * @param {Deps} deps @param {Plan} plan
 */
const collateralGuard = (deps, plan) =>
  Effect.gen(function* () {
    const current = yield* readCollateralTrader(deps.ctx, plan.facts.owner);
    if (
      current.state.sequenceNumber.sequenceNumber !==
        plan.facts.state.sequenceNumber.sequenceNumber ||
      current.state.sequenceNumber.lastUpdateSlot !== plan.facts.state.sequenceNumber.lastUpdateSlot
    )
      return yield* new BuildRejected({
        reason: "Phoenix trader changed after simulation; nothing was sent",
      });
    if (plan.facts.direction === "withdraw")
      yield* assertWithdrawalReady({
        config: deps.config,
        ctx: deps.ctx,
        owner: plan.facts.owner,
        trader: current.state,
      });
  });

/** @param {Deps} deps @param {Action} action */
export const simulateCollateral = (deps, action) =>
  Effect.gen(function* () {
    const plan = yield* planCollateral(deps, action);
    const simulated = yield* simulateDraft(deps.submission, {
      draft: plan.draft,
      probe: collateralProbe(plan),
    });
    const quote = /** @type {import("@solos-sh/actions").PerpCollateralQuote | null} */ (
      simulated.verdict
    );
    return simulationResult(action, simulated, quote);
  });

/**
 * A collateral transfer always simulates: its quote and its fixed-input check come from the
 * simulated balances (ADR-0026), so a Caller cannot skip it.
 * @param {Deps} deps @param {Action} action
 */
export const executeCollateral = (deps, action) =>
  Effect.gen(function* () {
    const plan = yield* planCollateral(deps, action);
    const delivered = yield* submitDraft(
      deps.submission,
      {
        draft: plan.draft,
        probe: collateralProbe(plan),
        guard: collateralGuard(deps, plan),
        requireSimulation: true,
      },
      { skipSimulation: false },
    );
    const reconciliation = yield* reconcileCollateral(deps.ctx, plan, delivered.signature);
    return { ...(yield* executionResult(action, delivered)), reconciliation };
  });
