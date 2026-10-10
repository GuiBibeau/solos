// @ts-check
import { StrategyStateSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { StrategyInvalid, StrategyNotFound } from "../domain/errors.js";
import { StrategyRepository } from "../ports/strategy-repository.js";

/**
 * @param {{ state?: string; owner?: string }} filter
 */
export const performList = (filter) =>
  Effect.gen(function* () {
    if (filter.state !== undefined && !StrategyStateSchema.safeParse(filter.state).success) {
      return yield* new StrategyInvalid({ reason: `unknown strategy state ${filter.state}` });
    }
    const strategies = yield* (yield* StrategyRepository).list(filter);
    return { strategies };
  }).pipe(Effect.withSpan("strategy.list"));

/** @param {string} id */
export const performGet = (id) =>
  Effect.gen(function* () {
    const strategy = yield* (yield* StrategyRepository).load(id);
    if (strategy === undefined) return yield* new StrategyNotFound({ id });
    return strategy;
  }).pipe(Effect.withSpan("strategy.get"));
