// @ts-check
import { Effect } from "effect";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { TickSource } from "../ports/tick-source.js";
import { performEngineTransition } from "./perform-engine.js";

/**
 * After a Tick is stored: pause, finish a finite schedule, or set the next due instant.
 * An in-flight Tick keeps its reservation and is not rescheduled.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {string} outcome
 * @param {number} now
 */
export const applyLifecycle = (strategy, outcome, now) =>
  Effect.gen(function* () {
    if (outcome === "in_flight") return;
    if (outcome === "failed" && (yield* pauseFailures(strategy))) return;
    if (outcome === "executed" && (yield* finishCount(strategy))) return;
    yield* scheduleNext(strategy, now);
  });

/** @param {import("@solos-sh/actions").Strategy} strategy */
const pauseFailures = (strategy) =>
  Effect.gen(function* () {
    const limit = strategy.bounds.maxConsecutiveFailures;
    const recent = yield* (yield* TickRepository).list({ strategyId: strategy.id, limit });
    if (!consecutiveFailures(recent, limit)) return false;
    const reason = recent[0]?.reason ?? `${limit} failed ticks in a row`;
    yield* performEngineTransition(strategy.id, "paused", reason);
    return true;
  });

/** @param {ReadonlyArray<{ outcome: string }>} ticks @param {number} limit */
const consecutiveFailures = (ticks, limit) => {
  let count = 0;
  for (const tick of ticks) {
    if (tick.outcome !== "failed") break;
    count += 1;
  }
  return count >= limit;
};

/** @param {import("@solos-sh/actions").Strategy} strategy */
const finishCount = (strategy) =>
  Effect.gen(function* () {
    if (strategy.kind !== "schedule" || strategy.params.count === undefined) return false;
    const found = yield* (yield* TickRepository).list({
      strategyId: strategy.id,
      outcome: "executed",
      limit: strategy.params.count,
    });
    if (found.length < strategy.params.count) return false;
    yield* performEngineTransition(strategy.id, "done", null);
    return true;
  });

/** @param {import("@solos-sh/actions").Strategy} strategy @param {number} now */
const scheduleNext = (strategy, now) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const current = yield* repository.load(strategy.id);
    if (current === undefined || current.state !== "active") return;
    const nextDueAt = (yield* (yield* TickSource).nextDue(current, now)) ?? null;
    yield* repository.save({ ...current, nextDueAt });
  });
