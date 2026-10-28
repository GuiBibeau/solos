// @ts-check
import { Effect } from "effect";
import { TickRepository } from "../ports/tick-repository.js";
import { performEngineTransition } from "./perform-engine.js";

/**
 * Pause a carry that filled one leg and then stopped, or that finished an unwind.
 * A readiness failure still counts toward maxConsecutiveFailures and is not paused here.
 * @param {import("@solos-sh/actions").Strategy} strategy
 */
export const pauseCarryTick = (strategy) =>
  Effect.gen(function* () {
    if (strategy.kind !== "carry") return false;
    const recent = yield* (yield* TickRepository).list({ strategyId: strategy.id, limit: 1 });
    const tick = recent[0];
    const reason = pauseReason(tick);
    if (reason === undefined) return false;
    yield* performEngineTransition(strategy.id, "paused", reason);
    return true;
  });

/**
 * @param {{
 *   readonly outcome?: string;
 *   readonly step?: number;
 *   readonly reason?: string;
 *   readonly state?: { readonly pauseAfter?: boolean; readonly pauseReason?: string; readonly reason?: string };
 * } | undefined} tick
 */
const pauseReason = (tick) => {
  if (tick === undefined) return undefined;
  return failedLeg(tick) ?? finishedUnwind(tick);
};

/** @param {NonNullable<Parameters<typeof pauseReason>[0]>} tick */
const failedLeg = (tick) => {
  if (tick.outcome !== "failed" || tick.step === undefined || tick.step === 0) return undefined;
  return tick.reason ?? "a carry tick stopped after a leg settled";
};

/** @param {NonNullable<Parameters<typeof pauseReason>[0]>} tick */
const finishedUnwind = (tick) => {
  if (tick.outcome !== "executed" || tick.state?.pauseAfter !== true) return undefined;
  return tick.state.pauseReason ?? named(tick.state.reason);
};

/** @param {string | undefined} reason */
const named = (reason) => reason ?? "unwind";
