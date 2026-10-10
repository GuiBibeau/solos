// @ts-check
import { Effect } from "effect";
import { errorEnvelope } from "../../shared/domain/error-envelope.js";
import { nextInstant } from "../domain/cadence.js";
import { StrategyNotFound } from "../domain/errors.js";
import { refusalFor } from "../domain/transitions.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";

/** @param {string} id */
const missing = (id) => new StrategyNotFound({ id });

/**
 * @param {string} id
 * @param {string} state
 */
export const performUpdate = (id, state) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const current = yield* repository.load(id);
    if (current === undefined) return yield* missing(id);
    const refusal = refusalFor({ id, from: current.state, to: state, actor: "caller" });
    if (refusal !== undefined) return yield* refusal;
    yield* repository.save(yield* moved(current, state));
    return { id, state };
  }).pipe(Effect.withSpan("strategy.update"));

/**
 * Resume schedules the next Tick one interval from now. Pause and cancel clear it.
 * @param {import("@solos-sh/actions").Strategy} current
 * @param {string} state
 */
const moved = (current, state) =>
  Effect.gen(function* () {
    const next = /** @type {typeof current.state} */ (state);
    if (next !== "active") return { ...current, state: next, nextDueAt: null };
    const now = yield* (yield* StrategyIds).now();
    return { ...current, state: next, reason: null, nextDueAt: nextInstant(current, now) ?? null };
  });

/**
 * The resulting state and whether the transition is allowed. Applies nothing.
 * @param {string} id
 * @param {string} state
 */
export const performSimulateUpdate = (id, state) =>
  Effect.gen(function* () {
    const current = yield* (yield* StrategyRepository).load(id);
    if (current === undefined) return yield* missing(id);
    const refusal = refusalFor({ id, from: current.state, to: state, actor: "caller" });
    if (refusal !== undefined) {
      return { allowed: false, state: current.state, refusal: errorEnvelope(refusal) ?? {} };
    }
    return { allowed: true, state };
  }).pipe(Effect.withSpan("strategy.simulateUpdate"));
