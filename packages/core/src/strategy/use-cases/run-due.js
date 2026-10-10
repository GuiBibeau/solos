// @ts-check
import { Effect } from "effect";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { performEngineTransition } from "./perform-engine.js";
import { runTick } from "./run-tick.js";

/** Run every schedule Strategy whose next due instant has arrived. Strategies run concurrently. */
export const runDueTicks = () =>
  Effect.gen(function* () {
    const now = yield* (yield* StrategyIds).now();
    const due = [];
    for (const strategy of yield* (yield* StrategyRepository).byState("active")) {
      if (!(yield* isDue(strategy, now))) continue;
      due.push(strategy);
    }
    yield* Effect.forEach(due, (strategy) => runTick(strategy), { concurrency: "unbounded" });
  }).pipe(Effect.withSpan("strategy.runDue"));

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 */
const isDue = (strategy, now) =>
  Effect.gen(function* () {
    if (strategy.kind !== "schedule") return false;
    const open = yield* (yield* TickRepository).list({
      strategyId: strategy.id,
      outcome: "in_flight",
      limit: 1,
    });
    if (open.length > 0) return false;
    const dueAt = strategy.nextDueAt;
    if (dueAt == null || now < dueAt) return false;
    if (strategy.expiresAt != null && dueAt >= strategy.expiresAt) {
      yield* performEngineTransition(strategy.id, "expired", "expiresAt has passed");
      return false;
    }
    return true;
  });
