// @ts-check
import { Effect } from "effect";
import { evaluateKind, observationNames } from "../domain/evaluator.js";
import { intentIdFor } from "../domain/intent-id.js";
import { buildTick } from "../domain/tick-build.js";
import { ObservationReader } from "../ports/observation-reader.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { TickRepository } from "../ports/tick-repository.js";
import { runStep } from "./run-step.js";
import { applyLifecycle } from "./tick-lifecycle.js";

/**
 * One Tick for one Strategy: observe, evaluate, bound, execute, settle, record.
 * @param {import("@solos-sh/actions").Strategy} strategy
 */
export const runTick = (strategy) =>
  Effect.gen(function* () {
    const now = yield* (yield* StrategyIds).now();
    const dueAt = strategy.nextDueAt ?? now;
    const tickId = yield* (yield* StrategyIds).ulid();
    const names = observationNames(strategy.kind);
    const read = yield* (yield* ObservationReader)
      .read({ names, strategyId: strategy.id, instant: dueAt })
      .pipe(Effect.either);
    if (read._tag === "Left") return yield* storeSkip(strategy, { tickId, dueAt, now, names });
    const observations = pick(names, read.right);
    if (observations === undefined)
      return yield* storeSkip(strategy, { tickId, dueAt, now, names });
    const decision = evaluateKind(
      strategy,
      observations,
      yield* (yield* TickRepository).recent(strategy.id),
    );
    return yield* recordDecision(strategy, { tickId, dueAt, now, observations, decision });
  }).pipe(Effect.withSpan("strategy.tick"));

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{
 *   tickId: string;
 *   dueAt: number;
 *   now: number;
 *   observations: Readonly<Record<string, string | number>>;
 *   decision: ReturnType<typeof evaluateKind>;
 * }} input
 */
const recordDecision = (strategy, input) =>
  Effect.gen(function* () {
    if (input.decision.failure) {
      return yield* store(strategy, input, {
        outcome: "failed",
        reason: input.decision.failure.reason,
        remedy: input.decision.failure.remedy,
      });
    }
    const dry = (yield* RunMode).dry;
    if (dry || input.decision.actions.length === 0) {
      return yield* store(strategy, input, { outcome: "evaluated" });
    }
    return yield* executeAll(strategy, input);
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{
 *   tickId: string;
 *   dueAt: number;
 *   now: number;
 *   observations: Readonly<Record<string, string | number>>;
 *   decision: ReturnType<typeof evaluateKind>;
 * }} input
 */
const executeAll = (strategy, input) =>
  Effect.gen(function* () {
    yield* (yield* TickRepository).save(inFlight(strategy, input));
    return yield* store(strategy, input, yield* runActions(strategy, input));
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{
 *   tickId: string;
 *   dueAt: number;
 *   now: number;
 *   observations: Readonly<Record<string, string | number>>;
 *   decision: ReturnType<typeof evaluateKind>;
 * }} input
 */
const inFlight = (strategy, input) =>
  buildTick({
    tickId: input.tickId,
    strategyId: strategy.id,
    dueAt: input.dueAt,
    startedAt: input.now,
    finishedAt: null,
    outcome: "in_flight",
    observations: input.observations,
    actions: input.decision.actions,
    intents: [],
    ...(input.decision.note !== undefined && { note: input.decision.note }),
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{ tickId: string; decision: ReturnType<typeof evaluateKind> }} input
 */
const runActions = (strategy, input) =>
  Effect.gen(function* () {
    /** @type {import("../domain/tick.js").TickIntent[]} */
    const intents = [];
    /** @type {import("../domain/tick.js").TickOutcome} */
    let outcome = "executed";
    /** @type {string | undefined} */
    let reason;
    /** @type {string | undefined} */
    let remedy;
    /** @type {number | undefined} */
    let step;
    for (const [index, action] of input.decision.actions.entries()) {
      const result = yield* stepResult({
        strategyId: strategy.id,
        tickId: input.tickId,
        index,
        action,
      });
      if (result.intent) intents.push(result.intent);
      if (reason === undefined && result.reason !== undefined) {
        reason = result.reason;
        remedy = result.remedy;
      }
      if (result.outcome === "executed") continue;
      outcome = result.outcome;
      step = index;
      break;
    }
    return { outcome, intents, reason, remedy, step };
  });

/**
 * @param {{
 *   strategyId: string;
 *   tickId: string;
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 * }} input
 */
const stepResult = (input) =>
  runStep({
    strategyId: input.strategyId,
    tickId: input.tickId,
    intentId: intentIdFor(input.strategyId, input.tickId, input.index),
    action: input.action,
  });

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

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{ tickId: string; dueAt: number; now: number; names: readonly string[] }} input
 */
const storeSkip = (strategy, input) =>
  store(
    strategy,
    { ...input, observations: {}, decision: { actions: [], note: undefined } },
    {
      outcome: "skipped_observation",
      reason: "a declared observation was missing",
      remedy: "retry when the observation reader can supply every declared read",
    },
  );

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{
 *   tickId: string;
 *   dueAt: number;
 *   now: number;
 *   observations: Readonly<Record<string, string | number>>;
 *   decision: { actions: ReadonlyArray<import("@solos-sh/actions").Action>; note?: string };
 * }} input
 * @param {{
 *   outcome: import("../domain/tick.js").TickOutcome;
 *   intents?: ReadonlyArray<import("../domain/tick.js").TickIntent>;
 *   reason?: string;
 *   remedy?: string;
 *   step?: number;
 * }} result
 */
const store = (strategy, input, result) =>
  Effect.gen(function* () {
    const tick = buildTick({
      tickId: input.tickId,
      strategyId: strategy.id,
      dueAt: input.dueAt,
      startedAt: input.now,
      finishedAt: result.outcome === "in_flight" ? null : input.now,
      outcome: result.outcome,
      observations: input.observations,
      actions: input.decision.actions,
      intents: result.intents ?? [],
      ...(input.decision.note !== undefined && { note: input.decision.note }),
      ...(result.reason !== undefined && { reason: result.reason }),
      ...(result.remedy !== undefined && { remedy: result.remedy }),
      ...(result.step !== undefined && { step: result.step }),
    });
    yield* (yield* TickRepository).save(tick);
    yield* applyLifecycle(strategy, result.outcome, input.now);
    return tick;
  });
