// @ts-check
import { SCHEDULE_OBSERVATIONS, evaluateSchedule } from "./schedule-kind.js";

/**
 * The observations a kind declares. The Tick record holds these and nothing else.
 * @param {string} kind
 * @returns {readonly string[]}
 */
export const observationNames = (kind) => (kind === "schedule" ? SCHEDULE_OBSERVATIONS : []);

/**
 * One evaluate interface. Callers do not switch on kind.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 */
export const evaluateKind = (strategy, observations, state) => {
  if (strategy.kind === "schedule") return evaluateSchedule(strategy.params, observations, state);
  return {
    actions: /** @type {ReadonlyArray<import("@solos-sh/actions").Action>} */ ([]),
    state,
    note: `${strategy.kind} is not a runnable kind`,
  };
};
