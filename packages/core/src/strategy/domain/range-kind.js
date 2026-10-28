// @ts-check
import { centeredLowerBin, recenterDay, windowIssue } from "./range-math.js";
import {
  depositAmounts,
  insideNote,
  moved,
  recenterActions,
  snapshot,
  waitNote,
} from "./range-plan.js";
import { budgetFor, readRangeState } from "./range-state.js";

/** Static observations for a range tick: pool, position, prices, and the tick instant. */
export const RANGE_OBSERVATIONS = [
  "instant",
  "activeId",
  "binStep",
  "tokenAMint",
  "tokenADecimals",
  "tokenBMint",
  "tokenBDecimals",
  "priceAPerB",
  "poolAt",
  "position",
  "lowerBinId",
  "upperBinId",
  "amountA",
  "amountB",
  "valueUsd",
  "priceA",
  "priceB",
];

const MISSING_REMEDY = "read the Meteora position again; it must carry lowerBinId and upperBinId";

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state: import("./range-state.js").RangeState;
 *   readonly note: string;
 *   readonly reason?: string;
 *   readonly revert?: import("./range-state.js").RangeState;
 *   readonly failure?: { readonly reason: string; readonly remedy: string };
 * }} RangeDecision
 */

/**
 * Pure range evaluation. Inside the window the streak resets. Outside, the streak
 * must clear the debounce and the UTC-day budget before the four recenter Actions fire.
 * @param {import("@solos-sh/actions").RangeParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 * @returns {RangeDecision}
 */
export const evaluateRange = (params, observations, state) => {
  const prior = readRangeState(state);
  const observed = readObserved(observations);
  const budget = budgetFor(prior, recenterDay(observed.instant));
  if (observed.lowerBinId === undefined || observed.upperBinId === undefined) {
    return missing(params, prior, budget);
  }
  if (observed.activeId === undefined) return missing(params, prior, budget);
  const view = /** @type {View} */ ({ ...observed, params, prior, budget });
  if (isInside(observed)) return held(view, 0, insideNote(observed));
  const nextStreak = prior.outsideStreak + 1;
  if (nextStreak < params.recenterWhenOutsideFor)
    return held(view, nextStreak, waitNote(view, nextStreak));
  if (budget.recentersToday >= params.maxRecentersPerDay) return exhausted(view, nextStreak);
  return fire(view, nextStreak);
};

/**
 * @typedef {{
 *   readonly activeId?: number;
 *   readonly lowerBinId?: number;
 *   readonly upperBinId?: number;
 *   readonly amountA: string;
 *   readonly amountB: string;
 *   readonly instant: number;
 * }} Observed
 * @typedef {Observed & {
 *   readonly params: import("@solos-sh/actions").RangeParams;
 *   readonly prior: import("./range-state.js").RangeState;
 *   readonly budget: { recentersToday: number; recenterDay: number };
 * }} View
 */

/** @param {Readonly<Record<string, string | number>>} observations @returns {Observed} */
const readObserved = (observations) => {
  const activeId = integer(observations.activeId);
  const lowerBinId = integer(observations.lowerBinId);
  const upperBinId = integer(observations.upperBinId);
  return {
    ...(activeId !== undefined && { activeId }),
    ...(lowerBinId !== undefined && { lowerBinId }),
    ...(upperBinId !== undefined && { upperBinId }),
    amountA: u64(observations.amountA),
    amountB: u64(observations.amountB),
    instant: integer(observations.instant) ?? 0,
  };
};

/** @param {Observed} observed */
const isInside = (observed) =>
  observed.activeId !== undefined &&
  observed.lowerBinId !== undefined &&
  observed.upperBinId !== undefined &&
  observed.activeId >= observed.lowerBinId &&
  observed.activeId <= observed.upperBinId;

/**
 * @param {View} view
 * @param {number} streak
 * @param {string} note
 * @returns {RangeDecision}
 */
const held = (view, streak, note) => ({
  actions: [],
  state: snapshot(view, {
    streak,
    recentersToday: view.budget.recentersToday,
    lastRecenterAt: view.prior.lastRecenterAt,
  }),
  note,
});

/** @param {View} view @param {number} streak @returns {RangeDecision} */
const exhausted = (view, streak) => {
  const note = `maxRecentersPerDay ${view.params.maxRecentersPerDay} is exhausted for the day`;
  return { ...held(view, streak, note), reason: note };
};

/** @param {View} view @param {number} streak @returns {RangeDecision} */
const fire = (view, streak) => {
  const lower = centeredLowerBin(/** @type {number} */ (view.activeId), view.params.width);
  const issue = windowIssue(lower, view.params.width);
  if (issue !== null) return refused(view, streak, issue);
  const committed = moved(view, {
    lower,
    recentersToday: view.budget.recentersToday + 1,
    instant: view.instant,
  });
  return {
    actions: recenterActions(view.params, lower, depositAmounts(view)),
    state: committed,
    revert: snapshot(view, {
      streak,
      recentersToday: view.budget.recentersToday,
      lastRecenterAt: view.prior.lastRecenterAt,
    }),
    note: `recentering to bins ${lower}..${lower + view.params.width - 1}`,
  };
};

/** @param {View} view @param {number} streak @param {string} issue @returns {RangeDecision} */
const refused = (view, streak, issue) => ({
  ...held(view, streak, issue),
  failure: {
    reason: issue,
    remedy: "choose a width whose centred window stays inside the Meteora bin bounds",
  },
});

/**
 * @param {import("@solos-sh/actions").RangeParams} params
 * @param {import("./range-state.js").RangeState} prior
 * @param {{ recentersToday: number; recenterDay: number }} budget
 * @returns {RangeDecision}
 */
const missing = (params, prior, budget) => ({
  actions: [],
  state: {
    ...prior,
    position: params.position,
    recentersToday: budget.recentersToday,
    recenterDay: budget.recenterDay,
  },
  note: "position range is missing",
  failure: { reason: "position range is missing", remedy: MISSING_REMEDY },
});

/** @param {unknown} value */
const integer = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;

/** @param {unknown} value */
const u64 = (value) => (typeof value === "string" && /^\d+$/.test(value) ? value : "0");
