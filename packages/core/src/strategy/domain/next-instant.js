// @ts-check
import { nextInstant } from "./cadence.js";

const CLOCK_KINDS = new Set(["schedule", "trigger", "rebalance", "range", "carry"]);

/** A kind the clock wakes. Trigger, rebalance, range, and carry share the schedule's interval. @param {string} kind */
export const isClockKind = (kind) => CLOCK_KINDS.has(kind);

/**
 * The next due instant for a clock-ticked kind. Other kinds stay unscheduled.
 * @param {import("@solos-sh/actions").Strategy} strategy
 * @param {number} now
 */
export const nextDueInstant = (strategy, now) => {
  if (!isClockKind(strategy.kind)) return undefined;
  return nextInstant(strategy, now);
};
