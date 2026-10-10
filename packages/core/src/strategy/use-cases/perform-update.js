// @ts-check
import { Effect } from "effect";
import { errorEnvelope } from "../../shared/domain/error-envelope.js";
import { StrategyNotFound } from "../domain/errors.js";
import { refusalFor } from "../domain/transitions.js";
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
    yield* repository.save({ ...current, state: /** @type {typeof current.state} */ (state) });
    return { id, state };
  }).pipe(Effect.withSpan("strategy.update"));

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
