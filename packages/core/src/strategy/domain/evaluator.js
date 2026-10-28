// @ts-check
import { RANGE_OBSERVATIONS, evaluateRange } from "./range-kind.js";
import { rebalanceObservations, evaluateRebalance } from "./rebalance-kind.js";
import { SCHEDULE_OBSERVATIONS, evaluateSchedule } from "./schedule-kind.js";
import { TRIGGER_OBSERVATIONS, evaluateTrigger } from "./trigger-kind.js";

/**
 * The observations a kind declares. The Tick record holds these and nothing else.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @returns {readonly string[]}
 */
export const observationNames = (strategy) => {
  if (strategy.kind === "schedule") return SCHEDULE_OBSERVATIONS;
  if (strategy.kind === "trigger") return TRIGGER_OBSERVATIONS;
  if (strategy.kind === "rebalance") return rebalanceObservations(strategy.params);
  if (strategy.kind === "range") return RANGE_OBSERVATIONS;
  return [];
};

/**
 * One evaluate interface. Callers do not switch on kind.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 */
export const evaluateKind = (strategy, observations, state) => {
  if (strategy.kind === "schedule") return evaluateSchedule(strategy.params, observations, state);
  if (strategy.kind === "trigger") return evaluateTrigger(strategy.params, observations, state);
  if (strategy.kind === "rebalance") return evaluateRebalance(strategy.params, observations, state);
  if (strategy.kind === "range") return evaluateRange(strategy.params, observations, state);
  return {
    actions: /** @type {ReadonlyArray<import("@solos-sh/actions").Action>} */ ([]),
    state,
    note: `${strategy.kind} is not a runnable kind`,
  };
};
