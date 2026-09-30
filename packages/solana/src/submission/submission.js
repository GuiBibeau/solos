// @ts-check
/**
 * Submission (ADR-0031): the one order every v1 transaction takes, from a venue's draft to the
 * chain.
 *
 *   seal → lifetime → simulate → venue guard → lifetime → deliver → confirm
 *
 * Sealing (ADR-0032) fetches the lifetime and signs the venue's draft. The mode's parameters
 * switch steps on or off; nothing reorders them. Simulating is the first half of this order,
 * run by the same code, so what the simulate tier checks is what the execute tier checks.
 * Venues hand over a draft and may contribute a probe (what a simulation must show) and a guard
 * (what must still hold right before sending); they never sign or send.
 */
import { SimulationFailed } from "@solos/core";
import { Effect } from "effect";
import { simulationErrorText } from "../executor/simulation-error-text.js";
import { confirmDelivery } from "./confirm.js";
import { assertLive } from "./lifetime.js";
import { sealDraft } from "./seal-draft.js";
import { simulateSealed } from "./simulate.js";

/**
 * @typedef {import("./seal-draft.js").SealDeps & {
 *   readonly submitter: import("./submitter.js").SubmitterShape;
 * }} SubmissionDeps
 * @typedef {{
 *   readonly draft: import("./seal-draft.js").Draft;
 *   readonly probe?: import("./simulate.js").Probe;
 *   readonly guard?: Effect.Effect<void, import("@solos/core").ExecutorError>;
 *   readonly requireSimulation?: boolean;
 * }} SubmissionRequest
 * @typedef {{
 *   readonly signature: import("@solana/kit").Signature;
 *   readonly simulated: boolean;
 *   readonly verdict: unknown;
 * }} Delivered
 */

/** @param {SubmissionDeps} deps @param {import("./sealed.js").Sealed} sealed */
const checkLifetime = (deps, sealed) =>
  deps.mode.lifetime.recheck ? assertLive(deps.ctx, sealed, deps.mode.lifetime) : Effect.void;

/**
 * The simulate tier: seal, check the lifetime, simulate with the venue's probe. A failed
 * simulation is returned for the caller to report, not raised. Nothing signed here is sent, and
 * nothing sent here is signed: the RPC receives the bytes with their signatures zeroed, so a
 * hostile or compromised endpoint holds nothing it could broadcast (ADR-0033).
 * @param {SubmissionDeps} deps
 * @param {SubmissionRequest} request
 * @returns {Effect.Effect<import("./simulate.js").Simulated, import("@solos/core").ExecutorError>}
 */
export const simulateDraft = (deps, request) =>
  Effect.gen(function* () {
    const sealed = yield* sealDraft(deps, request.draft);
    yield* checkLifetime(deps, sealed);
    return yield* simulateSealed(deps.ctx, sealed, { probe: request.probe, unsigned: true });
  }).pipe(Effect.withSpan("submission.simulate"));

/**
 * A venue that cannot bound its effect any other way requires simulation; a Caller's explicit
 * skip never removes it.
 * @param {SubmissionDeps} deps @param {SubmissionRequest} request @param {{ readonly skipSimulation: boolean }} options
 */
const simulates = (deps, request, options) =>
  request.requireSimulation === true || (deps.mode.simulate && !options.skipSimulation);

/** @param {SubmissionDeps} deps @param {import("./sealed.js").Sealed} sealed @param {SubmissionRequest["probe"]} probe */
const simulateOrRefuse = (deps, sealed, probe) =>
  Effect.flatMap(simulateSealed(deps.ctx, sealed, { probe }), (outcome) =>
    outcome.err === null
      ? Effect.succeed(outcome.verdict)
      : Effect.fail(
          new SimulationFailed({ reason: simulationErrorText(outcome.err), logs: outcome.logs }),
        ),
  );

/**
 * The whole order. Everything before delivery refuses with "nothing was sent"; only delivery
 * and confirmation can end in a TransactionFailed that carries a signature. The check right
 * after sealing stays because signing can take seconds with a remote signer; the one before
 * delivery runs only when a simulation or a guard took time since then.
 * @param {SubmissionDeps} deps
 * @param {SubmissionRequest} request
 * @param {{ readonly skipSimulation: boolean }} options
 * @returns {Effect.Effect<Delivered, import("@solos/core").ExecutorError>}
 */
export const submitDraft = (deps, request, options) =>
  Effect.gen(function* () {
    const sealed = yield* sealDraft(deps, request.draft);
    const simulated = simulates(deps, request, options);
    yield* checkLifetime(deps, sealed);
    const verdict = simulated ? yield* simulateOrRefuse(deps, sealed, request.probe) : null;
    if (request.guard !== undefined) yield* request.guard;
    if (simulated || request.guard !== undefined) yield* checkLifetime(deps, sealed);
    const signature = yield* confirmDelivery(deps.submitter, sealed, deps.mode.confirmation);
    return { signature, simulated, verdict };
  }).pipe(Effect.withSpan("submission.submit"));
