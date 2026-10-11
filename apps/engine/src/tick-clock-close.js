// @ts-check
import {
  CapLedger,
  StrategyIds,
  StrategyRepository,
  TickRepository,
  TickSource,
} from "@solos/core/strategy";
import { Effect } from "effect";

/** @typedef {import("./http.js").EngineDeps["runtime"]} TickRuntime */
/** @typedef {import("@solos/core/strategy").Tick} Tick */
/** @typedef {import("@solos-sh/actions").Strategy} Strategy */

/**
 * @typedef {{ kind: "leave" | "stop" } | {
 *   kind: "settle" | "release";
 *   outcome: "executed" | "failed";
 *   intentId: string;
 *   signature: string;
 *   notionalUsd: string;
 *   mint: string;
 *   usd?: string;
 * }} StepDecision
 */

/**
 * @param {TickRuntime} runtime
 * @param {{ strategy: Strategy; tick: Tick }} work
 * @param {StepDecision[]} steps
 */
export const applySteps = async (runtime, work, steps) => {
  for (const step of steps) {
    const held = await runtime.runPromise(applyStep(work, step));
    if (!held) return false;
  }
  return true;
};

/**
 * @param {TickRuntime} runtime
 * @param {Strategy} strategy
 * @param {{ tick: Tick; steps: StepDecision[] }} closed
 */
export const closeTick = (runtime, strategy, closed) =>
  runtime.runPromise(saveTick(strategy, closed));

/**
 * @param {{ strategy: Strategy; tick: Tick }} work
 * @param {StepDecision} step
 */
const applyStep = (work, step) => {
  if (step.kind === "release") return releaseHold(holdRequest(work, step));
  if (step.kind !== "settle") return Effect.succeed(true);
  return settleHold(work, step, step.usd ?? "0");
};

/**
 * @param {{ strategy: Strategy; tick: Tick }} work
 * @param {Exclude<StepDecision, { kind: "leave" | "stop" }>} step
 * @param {string} usd
 */
const settleHold = (work, step, usd) =>
  Effect.gen(function* () {
    const held = yield* (yield* CapLedger).reserve(holdRequest(work, step)).pipe(Effect.either);
    if (held._tag === "Left") return false;
    yield* (yield* CapLedger).settle(held.right.reservationId, usd);
    return true;
  });

/** @param {import("@solos/core/strategy").ReserveRequest} request */
const releaseHold = (request) =>
  Effect.gen(function* () {
    const held = yield* (yield* CapLedger).reserve(request).pipe(Effect.either);
    if (held._tag === "Left") return true;
    yield* (yield* CapLedger).release(held.right.reservationId);
    return true;
  });

/**
 * @param {Strategy} strategy
 * @param {{ tick: Tick; steps: StepDecision[] }} closed
 */
const saveTick = (strategy, closed) =>
  Effect.gen(function* () {
    const now = yield* (yield* StrategyIds).now();
    const open = yield* (yield* TickRepository).list({
      strategyId: closed.tick.strategyId,
      outcome: "in_flight",
      limit: 20,
    });
    if (open.every((row) => row.tickId !== closed.tick.tickId)) return;
    yield* (yield* TickRepository).save(closedBody(closed.tick, closed.steps, now));
    yield* reschedule(strategy, now);
  });

/**
 * @param {Tick} tick
 * @param {StepDecision[]} steps
 * @param {number} now
 */
const closedBody = (tick, steps, now) => {
  const failed = steps.some((step) => isFailed(step));
  const failedAt = steps.findIndex((step) => isFailed(step));
  return {
    ...tick,
    outcome: /** @type {Tick["outcome"]} */ (failed ? "failed" : "executed"),
    finishedAt: now,
    intents: steps.map((step) => intentBody(step)),
    ...(failed && { step: Math.max(failedAt, 0), reason: "the in-flight tick did not settle" }),
  };
};

/** @param {StepDecision} step */
const isFailed = (step) =>
  step.kind === "release" || (step.kind === "settle" && step.outcome === "failed");

/**
 * @param {StepDecision} step
 * @returns {Tick["intents"][number]}
 */
const intentBody = (step) => {
  if (step.kind !== "settle" && step.kind !== "release") {
    return { intentId: "", state: "failed" };
  }
  const state = isFailed(step) ? "failed" : "settled";
  return {
    intentId: step.intentId,
    state,
    signature: step.signature,
    notionalUsd: step.notionalUsd,
    mint: step.mint,
  };
};

/** @param {Strategy} strategy @param {number} now */
const reschedule = (strategy, now) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const current = yield* repository.load(strategy.id);
    if (current === undefined || current.state !== "active") return;
    const nextDueAt = (yield* (yield* TickSource).nextDue(current, now)) ?? null;
    yield* repository.save({ ...current, nextDueAt });
  });

/**
 * @param {{ strategy: Strategy; tick: Tick }} work
 * @param {Exclude<StepDecision, { kind: "leave" | "stop" }>} step
 */
const holdRequest = (work, step) => ({
  strategyId: work.strategy.id,
  tickId: work.tick.tickId,
  intentId: step.intentId,
  notionalUsd: step.notionalUsd,
  mint: step.mint,
});
