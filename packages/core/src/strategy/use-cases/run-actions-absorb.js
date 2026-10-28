// @ts-check
import { Effect } from "effect";
import { intentIdFor } from "../domain/intent-id.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import {
  amountPair,
  applyPosition,
  applyWithdrawal,
  openedPosition,
  stepFailure,
} from "./range-handoff.js";

/**
 * @param {{
 *   strategy: import("@solos-sh/actions").Strategy;
 *   input: { now: number; tickId: string };
 *   actions: (import("@solos-sh/actions").Action | undefined)[];
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 *   result: import("./run-step.js").StepResult;
 * }} step
 */
export const absorb = (step) =>
  Effect.gen(function* () {
    if (step.result.outcome !== "executed") return stopOf(step);
    const amounts = amountPair(step.result.details);
    applyWithdrawal(step.actions, step.index + 1, amounts);
    const position = openedPosition(step.result.details);
    if (position === undefined) return { stop: false, opened: undefined };
    applyPosition(step.actions, step.index + 1, position);
    yield* rememberPosition(step.strategy, step.input.now, position);
    return { stop: false, opened: position };
  });

/**
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 * @param {string} position
 */
const rememberPosition = (strategy, now, position) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const current = yield* repository.load(strategy.id);
    if (current === undefined || current.kind !== "range") return;
    if (current.params.position === position) return;
    yield* repository.save({
      ...current,
      params: { ...current.params, position },
      updatedAt: now,
    });
  });

/**
 * @param {{
 *   index: number;
 *   action: import("@solos-sh/actions").Action;
 *   strategy: import("@solos-sh/actions").Strategy;
 *   input: { tickId: string };
 *   result: import("./run-step.js").StepResult;
 * }} step
 */
const stopOf = (step) => ({
  stop: /** @type {const} */ (true),
  opened: undefined,
  reason: stepFailure({
    index: step.index,
    action: step.action,
    intentId: intentIdFor(step.strategy.id, step.input.tickId, step.index),
    ...(step.result.reason !== undefined && { reason: step.result.reason }),
  }),
  remedy: step.result.remedy,
});
