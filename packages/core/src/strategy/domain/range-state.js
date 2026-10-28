// @ts-check

/**
 * @typedef {{
 *   readonly activeId?: number;
 *   readonly lowerBinId?: number;
 *   readonly upperBinId?: number;
 *   readonly position?: string;
 *   readonly outsideStreak: number;
 *   readonly recentersToday: number;
 *   readonly recenterDay?: number;
 *   readonly lastRecenterAt: number | null;
 *   readonly lastRecenterIntents: readonly string[];
 * }} RangeState
 */

/** @param {unknown} value @returns {RangeState} */
export const readRangeState = (value) => {
  const row = recordOf(value) ?? {};
  return {
    ...optionalNumber("activeId", row.activeId),
    ...optionalNumber("lowerBinId", row.lowerBinId),
    ...optionalNumber("upperBinId", row.upperBinId),
    ...optionalNumber("recenterDay", row.recenterDay),
    ...(typeof row.position === "string" && { position: row.position }),
    outsideStreak: integer(row.outsideStreak) ?? 0,
    recentersToday: integer(row.recentersToday) ?? 0,
    lastRecenterAt: integer(row.lastRecenterAt) ?? null,
    lastRecenterIntents: intentIds(row.lastRecenterIntents),
  };
};

/** @param {string} key @param {unknown} value */
const optionalNumber = (key, value) => {
  const parsed = integer(value);
  return parsed === undefined ? {} : { [key]: parsed };
};

/**
 * Today's recenter count. A new UTC day starts the budget over.
 * @param {RangeState} prior
 * @param {number} day
 */
export const budgetFor = (prior, day) => ({
  recentersToday: prior.recenterDay === day ? prior.recentersToday : 0,
  recenterDay: day,
});

/**
 * State saved on the Tick. A recenter counts only when the tick completes as executed.
 * An open that already settled keeps the new position address on any other outcome.
 * @param {{ readonly state?: unknown; readonly revert?: unknown; readonly openedPosition?: string }} decision
 * @param {string} outcome
 */
export const persistedRange = (decision, outcome) => {
  const committed = readRangeState(decision.state);
  if (outcome === "executed" || decision.revert === undefined) {
    return stamp(committed, decision.openedPosition);
  }
  return stamp(reverted(decision, committed), decision.openedPosition);
};

/**
 * Copy the settled Intent ids onto an executed range tick so later inside ticks still show them.
 * @param {unknown} state
 * @param {string} outcome
 * @param {ReadonlyArray<{ readonly intentId: string }> | undefined} intents
 */
export const withRecenterIntents = (state, outcome, intents) => {
  if (outcome !== "executed" || intents === undefined || !isRangeState(state)) return state;
  if (intents.length === 0) return state;
  return { ...state, lastRecenterIntents: intents.map((row) => row.intentId) };
};

/** @param {unknown} state */
export const isRangeState = (state) =>
  typeof state === "object" && state !== null && "outsideStreak" in state;

/**
 * @param {{ readonly revert?: unknown; readonly openedPosition?: string }} decision
 * @param {RangeState} committed
 */
const reverted = (decision, committed) => {
  const prior = readRangeState(decision.revert);
  if (decision.openedPosition === undefined) return prior;
  return {
    ...prior,
    ...(committed.activeId !== undefined && { activeId: committed.activeId }),
    ...(committed.lowerBinId !== undefined && { lowerBinId: committed.lowerBinId }),
    ...(committed.upperBinId !== undefined && { upperBinId: committed.upperBinId }),
  };
};

/**
 * @param {RangeState} state
 * @param {string | undefined} opened
 */
const stamp = (state, opened) => ({
  ...state,
  ...(opened !== undefined && { position: opened }),
});

/** @param {unknown} value */
const recordOf = (value) =>
  typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : undefined;

/** @param {unknown} value */
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

/** @param {unknown} value */
const intentIds = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
};
