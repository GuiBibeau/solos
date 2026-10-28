// @ts-check
import { Effect, Option } from "effect";
import { evaluateKind, observationNames } from "../domain/evaluator.js";
import { latestPersistedState } from "../domain/trigger-state.js";
import { ObservationReader } from "../ports/observation-reader.js";
import { ObservationStaleness } from "../ports/observation-staleness.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { TickRepository } from "../ports/tick-repository.js";
import { recordDecision, storeSkip } from "./tick-record.js";

/**
 * One Tick for one Strategy: observe, evaluate, bound, execute, settle, record.
 * @param {import("@solos-sh/actions").Strategy} strategy
 */
export const runTick = (strategy) =>
  Effect.gen(function* () {
    const now = yield* (yield* StrategyIds).now();
    const dueAt = strategy.nextDueAt ?? now;
    const tickId = yield* (yield* StrategyIds).ulid();
    const names = observationNames(strategy);
    const previous = latestPersistedState(yield* (yield* TickRepository).recent(strategy.id));
    const read = yield* (yield* ObservationReader)
      .read({ names, strategyId: strategy.id, instant: dueAt })
      .pipe(Effect.either);
    if (read._tag === "Left") {
      return yield* storeSkip(strategy, { tickId, dueAt, now, previous, error: read.left });
    }
    const observed = pick(names, read.right);
    if (observed === undefined) {
      return yield* storeSkip(strategy, { tickId, dueAt, now, previous });
    }
    const decision = evaluateKind(strategy, yield* enrich(strategy, observed, dueAt), previous);
    return yield* recordDecision(strategy, {
      tickId,
      dueAt,
      now,
      observations: observed,
      decision,
    });
  }).pipe(Effect.withSpan("strategy.tick"));

/**
 * The staleness limit is an Engine setting. It is not one of the kind's Observations.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {number} instant
 */
const enrich = (strategy, observations, instant) =>
  Effect.gen(function* () {
    if (strategy.kind !== "trigger") return observations;
    const configured = yield* Effect.serviceOption(ObservationStaleness);
    const stalenessMs = Option.isNone(configured)
      ? defaultStaleness(strategy)
      : configured.value.limitMs(strategy);
    return { ...observations, instant, stalenessMs };
  });

/** Two intervals when the Engine has not set a limit. @param {import("@solos-sh/actions").Strategy} strategy */
const defaultStaleness = (strategy) => {
  const source = strategy.tickSource;
  const every = source.type === "clock" ? source.every : undefined;
  return (every ?? 60_000) * 2;
};

/**
 * @param {readonly string[]} names
 * @param {Readonly<Record<string, string | number>>} values
 */
const pick = (names, values) => {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const name of names) {
    const value = values[name];
    if (value === undefined) return undefined;
    out[name] = value;
  }
  return out;
};
