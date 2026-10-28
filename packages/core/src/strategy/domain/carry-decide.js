// @ts-check
import { baseUnitsForUsd, compareSigned } from "./carry-decimal.js";
import { exitActions, unwindAction } from "./carry-plan.js";

const PRICE = {
  reason: "mark or mint price is missing",
  remedy: "wait for a positive USD price for the spot mint and the quote mint",
};
const UNWIND_REASON = "unwind: perp short with no spot leg";

/**
 * @typedef {{
 *   readonly mean: string;
 *   readonly entry: string;
 *   readonly exit: string;
 *   readonly breakEven: string;
 * }} CarryMath
 */

/**
 * Recorded spot, or a balance that already covers the sized leg.
 * @param {import("./carry-state.js").CarryState} state
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("@solos-sh/actions").CarryParams} params
 */
export const hasSpotLeg = (state, view, params) => {
  if (isPositiveAmount(state.spotAmount) && BigInt(view.spotBalance) > 0n) return true;
  return coversExpected(state, view, params);
};

/**
 * @param {import("./carry-state.js").CarryState} state
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("@solos-sh/actions").CarryParams} params
 */
const coversExpected = (state, view, params) => {
  if (isPositiveAmount(state.spotAmount) || view.spotPrice === undefined) return false;
  const expected = baseUnitsForUsd(params.notionalUsd, view.spotPrice, view.spotDecimals);
  if (expected === undefined || !isPositiveAmount(expected)) return false;
  return BigInt(view.spotBalance) >= BigInt(expected);
};

/**
 * @param {import("./carry-state.js").CarryState} state
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("@solos-sh/actions").CarryParams} params
 */
export const needsUnwind = (state, view, params) => {
  if (hasSpotLeg(state, view, params)) return false;
  if (state.naked) return true;
  return view.side === "short" && isPositiveAmount(view.perpSize);
};

/** @param {string} mean @param {import("@solos-sh/actions").CarryParams} params @param {string} breakEven */
export const shouldEnter = (mean, params, breakEven) =>
  compareSigned(mean, params.entryHurdleAprPct) > 0 && compareSigned(mean, breakEven) > 0;

/** @param {string} mean @param {import("@solos-sh/actions").CarryParams} params */
export const shouldExit = (mean, params) => {
  if (compareSigned(mean, "0") < 0) return true;
  return compareSigned(mean, params.exitHurdleAprPct) < 0;
};

/** @param {string} label @param {CarryMath} math @param {boolean} exiting */
export const carryNote = (label, math, exiting) => {
  const hurdle = exiting ? "exitHurdleAprPct" : "entryHurdleAprPct";
  const line = exiting ? math.exit : math.entry;
  return `${label}: trailingMeanAprPct ${math.mean} ${hurdle} ${line} breakEvenAprPct ${math.breakEven}`;
};

/**
 * @param {import("./carry-state.js").CarryState} state
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("@solos-sh/actions").CarryParams} params
 */
export const exitSpotAmount = (state, view, params) => {
  const carried = isPositiveAmount(state.spotAmount)
    ? state.spotAmount
    : expectedSpot(view, params);
  return minAmount(carried, view.spotBalance);
};

/**
 * @typedef {{
 *   readonly params: import("@solos-sh/actions").CarryParams;
 *   readonly view: import("./carry-view.js").CarryView;
 *   readonly base: Record<string, unknown>;
 *   readonly math: CarryMath;
 * }} ExitFrame
 */

/** @param {ExitFrame} frame @param {string} spotAmount */
export const exitDecision = (frame, spotAmount) => {
  if (frame.view.mark === undefined) return failed(frame, PRICE, true);
  return {
    actions: exitActions(frame.params, frame.view.mark, spotAmount),
    state: {
      ...frame.base,
      reason: "exit",
      side: "short",
      spotAmount,
      pauseAfter: false,
    },
    note: carryNote("exit", frame.math, true),
  };
};

/** @param {ExitFrame} frame */
export const unwindDecision = (frame) => {
  if (frame.view.mark === undefined) return failed(frame, PRICE, true);
  return {
    actions: [unwindAction(frame.params, frame.view.mark)],
    state: {
      ...frame.base,
      reason: "unwind",
      pauseAfter: true,
      pauseReason: UNWIND_REASON,
      naked: false,
      spotAmount: "0",
      side: "short",
    },
    note: `${carryNote("unwind", frame.math, true)}; ${UNWIND_REASON}`,
  };
};

/**
 * @param {ExitFrame} frame
 * @param {{ reason: string; remedy: string }} failure
 * @param {boolean} exiting
 */
export const failed = (frame, failure, exiting) => ({
  actions: /** @type {ReadonlyArray<import("@solos-sh/actions").Action>} */ ([]),
  state: frame.base,
  note: carryNote(failure.reason, frame.math, exiting),
  failure,
});

/** @param {import("./carry-view.js").CarryView} view @param {import("@solos-sh/actions").CarryParams} params */
const expectedSpot = (view, params) => {
  if (view.spotPrice === undefined) return view.spotBalance;
  return baseUnitsForUsd(params.notionalUsd, view.spotPrice, view.spotDecimals) ?? view.spotBalance;
};

/** @param {string} value */
const isPositiveAmount = (value) => value !== "" && value !== "0" && /[1-9]/.test(value);

/** @param {string} carried @param {string} balance */
const minAmount = (carried, balance) => {
  if (!isPositiveAmount(balance)) return carried;
  return BigInt(balance) < BigInt(carried) ? balance : carried;
};
