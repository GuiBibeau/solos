// @ts-check
import { StrategyStateSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { StrategyInvalid, StrategyNotFound } from "../domain/errors.js";
import { TICK_OUTCOMES } from "../domain/tick.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";

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
    const ticks = yield* (yield* TickRepository).list({ strategyId: id, limit: 1 });
    return { ...strategy, lastTick: ticks[0] ?? null, nextDueAt: strategy.nextDueAt ?? null };
  }).pipe(Effect.withSpan("strategy.get"));

/**
 * Newest Ticks first. `limit` defaults to 20 and cannot exceed 200.
 * @param {{ id: string; limit?: number; outcome?: string }} input
 */
export const performGetTicks = (input) =>
  Effect.gen(function* () {
    const strategy = yield* (yield* StrategyRepository).load(input.id);
    if (strategy === undefined) return yield* new StrategyNotFound({ id: input.id });
    const limit = input.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      return yield* new StrategyInvalid({ reason: "limit must be an integer from 1 to 200" });
    }
    if (input.outcome !== undefined && !TICK_OUTCOMES.includes(input.outcome)) {
      return yield* new StrategyInvalid({ reason: `unknown tick outcome ${input.outcome}` });
    }
    const ticks = yield* (yield* TickRepository).list({
      strategyId: input.id,
      limit,
      outcome: input.outcome,
    });
    return { ticks };
  }).pipe(Effect.withSpan("strategy.ticks"));
