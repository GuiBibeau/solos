// @ts-check
import { isCarryState, persistedCarry } from "./carry-state.js";
import { persistedRange } from "./range-state.js";
import { persistedState as persistedTrigger } from "./trigger-kind.js";

/**
 * State saved on the Tick. Range recenters commit only when the outcome is executed.
 * Other kinds keep the trigger rule.
 * @param {{ readonly state?: unknown; readonly revert?: unknown; readonly openedPosition?: string; readonly actions?: ReadonlyArray<{ readonly type: string; readonly notionalUsd?: string }> }} decision
 * @param {string} outcome
 * @param {{ readonly intents?: ReadonlyArray<{ readonly state?: string }> } | undefined} [extra]
 */
export const persistedState = (decision, outcome, extra) => {
  if (isRange(decision.state)) return persistedRange(decision, outcome);
  if (isCarryState(decision.state)) return persistedCarry(decision, outcome, extra);
  return persistedTrigger(decision, outcome);
};

/** @param {unknown} state */
const isRange = (state) => typeof state === "object" && state !== null && "outsideStreak" in state;
