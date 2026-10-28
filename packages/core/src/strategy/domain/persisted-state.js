// @ts-check
import { persistedRange } from "./range-state.js";
import { persistedState as persistedTrigger } from "./trigger-kind.js";

/**
 * State saved on the Tick. Range recenters commit only when the outcome is executed.
 * Other kinds keep the trigger rule.
 * @param {{ readonly state?: unknown; readonly revert?: unknown; readonly openedPosition?: string }} decision
 * @param {string} outcome
 */
export const persistedState = (decision, outcome) => {
  if (isRange(decision.state)) return persistedRange(decision, outcome);
  return persistedTrigger(decision, outcome);
};

/** @param {unknown} state */
const isRange = (state) => typeof state === "object" && state !== null && "outsideStreak" in state;
