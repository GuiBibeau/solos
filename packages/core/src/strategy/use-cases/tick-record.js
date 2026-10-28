// @ts-check
import { Effect } from "effect";
import { persistedState } from "../domain/persisted-state.js";
import { withRecenterIntents } from "../domain/range-state.js";
import { buildTick } from "../domain/tick-build.js";
import { RunMode } from "../ports/run-mode.js";
import { TickRepository } from "../ports/tick-repository.js";
import { executeActions } from "./run-actions.js";
import { applyLifecycle } from "./tick-lifecycle.js";

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state?: unknown;
 *   readonly note?: string;
 *   readonly reason?: string;
 *   readonly revert?: unknown;
 *   readonly openedPosition?: string;
 *   readonly skip?: { readonly reason: string; readonly remedy: string };
 *   readonly failure?: { readonly reason: string; readonly remedy: string };
 * }} Decision
 */

/**
 * @typedef {{
 *   tickId: string;
 *   dueAt: number;
 *   now: number;
 *   observations: Readonly<Record<string, string | number>>;
 *   decision: Decision;
 * }} TickInput
 */

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {TickInput} input
 */
export const recordDecision = (strategy, input) =>
  Effect.gen(function* () {
    if (input.decision.failure) {
      return yield* store(strategy, input, {
        outcome: "failed",
        reason: input.decision.failure.reason,
        remedy: input.decision.failure.remedy,
      });
    }
    if (input.decision.skip) {
      return yield* store(strategy, input, {
        outcome: "skipped_observation",
        reason: input.decision.skip.reason,
        remedy: input.decision.skip.remedy,
      });
    }
    const dry = (yield* RunMode).dry;
    if (dry || input.decision.actions.length === 0) {
      return yield* store(strategy, input, {
        outcome: "evaluated",
        ...(input.decision.reason !== undefined && { reason: input.decision.reason }),
      });
    }
    return yield* executeAll(strategy, input);
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {{ tickId: string; dueAt: number; now: number; previous?: unknown; error?: unknown }} input
 */
export const storeSkip = (strategy, input) =>
  store(
    strategy,
    {
      ...input,
      observations: {},
      decision: { actions: [], state: input.previous, note: undefined },
    },
    {
      outcome: "skipped_observation",
      reason: reasonOf(input.error),
      remedy: remedyOf(input.error),
    },
  );

/** @param {import("@solos-sh/actions").Strategy} strategy @param {TickInput} input */
const executeAll = (strategy, input) =>
  Effect.gen(function* () {
    yield* (yield* TickRepository).save(inFlight(strategy, input));
    const ran = yield* executeActions(strategy, input);
    const decision = {
      ...input.decision,
      actions: ran.actions,
      ...(ran.opened !== undefined && { openedPosition: ran.opened }),
    };
    return yield* store(strategy, { ...input, decision }, ran);
  });

/** @param {import("@solos-sh/actions").Strategy} strategy @param {TickInput} input */
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
    ...noteOf(input.decision.note),
    ...stateOf(persistedState(input.decision, "in_flight")),
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {TickInput} input
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
      ...noteOf(input.decision.note),
      ...stateOf(savedState(input.decision, result)),
      ...(result.reason !== undefined && { reason: result.reason }),
      ...(result.remedy !== undefined && { remedy: result.remedy }),
      ...(result.step !== undefined && { step: result.step }),
    });
    yield* (yield* TickRepository).save(tick);
    yield* applyLifecycle(strategy, result.outcome, input.now);
    return tick;
  });

/**
 * @param {Decision} decision
 * @param {{ outcome: string; intents?: ReadonlyArray<{ readonly intentId: string; readonly state?: string }> }} result
 */
const savedState = (decision, result) =>
  withRecenterIntents(
    persistedState(decision, result.outcome, result),
    result.outcome,
    result.intents,
  );

/** @param {string | undefined} note */
const noteOf = (note) => (note === undefined ? {} : { note });

/** @param {unknown} state */
const stateOf = (state) => {
  if (typeof state !== "object" || state === null || Object.keys(state).length === 0) return {};
  return { state: /** @type {import("../domain/tick.js").Tick["state"]} */ (state) };
};

/** @param {unknown} error */
const reasonOf = (error) => text(error, "reason", "a declared observation was missing");

/** @param {unknown} error */
const remedyOf = (error) =>
  text(error, "remedy", "retry when the observation reader can supply every declared read");

/** @param {unknown} error @param {"reason" | "remedy"} key @param {string} fallback */
const text = (error, key, fallback) => {
  if (key === "reason") {
    const message = error instanceof Error ? error.message : "";
    if (message.length > 0) return message;
  }
  return field(error, key) ?? fallback;
};

/** @param {unknown} error @param {"reason" | "remedy"} key */
const field = (error, key) => {
  if (typeof error !== "object" || error === null) return undefined;
  const value = key === "reason" ? reasonValue(error) : remedyValue(error);
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

/** @param {object} error */
const reasonValue = (error) => ("reason" in error ? error.reason : undefined);

/** @param {object} error */
const remedyValue = (error) => ("remedy" in error ? error.remedy : undefined);
