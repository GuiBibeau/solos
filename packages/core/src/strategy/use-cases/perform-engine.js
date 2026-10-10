// @ts-check
import { Effect } from "effect";
import { StrategyNotFound } from "../domain/errors.js";
import { refusalFor } from "../domain/transitions.js";
import { StrategyRepository } from "../ports/strategy-repository.js";

/**
 * An Engine-only lifecycle move. Clears the next due instant. `reason` is what status shows.
 * @param {string} id
 * @param {string} state
 * @param {string | null} [reason]
 */
export const performEngineTransition = (id, state, reason = null) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const current = yield* repository.load(id);
    if (current === undefined) return yield* new StrategyNotFound({ id });
    const refusal = refusalFor({ id, from: current.state, to: state, actor: "engine" });
    if (refusal !== undefined) return yield* refusal;
    yield* repository.save({ ...current, state: /** @type {typeof current.state} */ (state), nextDueAt: null, reason });
    return { id, state };
  }).pipe(Effect.withSpan("strategy.engineTransition"));
