// @ts-check
import {
  carryNote,
  shouldEnter,
  exitDecision,
  exitSpotAmount,
  failed,
  hasSpotLeg,
  needsUnwind,
  shouldExit,
  unwindDecision,
} from "./carry-decide.js";
import { breakEvenAprPct, trailingMean, windowSamples } from "./carry-math.js";
import { enterActions, entryFundingBlock, onboardFailure, sizeEntry } from "./carry-plan.js";
import { readCarryState } from "./carry-state.js";
import { readCarryView } from "./carry-view.js";

/** Static observations for a carry tick. The reader fills every name. */
export const CARRY_OBSERVATIONS = [
  "instant",
  "currentAprPct",
  "markPriceUsd",
  "fundingAt",
  "fundingHistory",
  "perpSide",
  "perpSize",
  "perpNotionalUsd",
  "onboarded",
  "equityUsd",
  "freeCollateralUsd",
  "spotBalance",
  "spotDecimals",
  "quoteBalance",
  "quoteDecimals",
  "spotPriceUsd",
  "quotePriceUsd",
  "quoteMint",
];

const FUNDING = {
  reason: "funding rate is missing",
  remedy: "wait for a Phoenix funding print for this market",
};

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state: Record<string, unknown>;
 *   readonly note: string;
 *   readonly failure?: { readonly reason: string; readonly remedy: string };
 * }} CarryDecision
 */

/**
 * Pure carry evaluation. Decimal strings only. No I/O.
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} prior
 * @returns {CarryDecision}
 */
export const evaluateCarry = (params, observations, prior) => {
  const state = readCarryState(prior);
  const view = readCarryView(observations);
  const measured = measure(params, view, state);
  const frame = {
    params,
    view,
    state,
    base: baseState(params, state, measured),
    math: numbers(measured),
  };
  if (measured.mean === undefined) return failed(frame, FUNDING, false);
  if (!view.onboarded) return failed(frame, onboardFailure(), false);
  if (needsUnwind(state, view, params)) return unwindDecision(frame);
  if (hasSpotLeg(state, view, params) && view.side === "short") return heldOrExit(frame);
  return flatDecision(frame);
};

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {import("./carry-view.js").CarryView} view
 * @param {import("./carry-state.js").CarryState} state
 */
const measure = (params, view, state) => {
  const samples = windowSamples({
    prior: state.fundingSamples,
    history: view.history,
    current: currentSample(view),
    now: view.instant,
    lookbackHours: params.lookbackHours,
  });
  return {
    samples,
    mean: trailingMean(samples),
    breakEven: breakEvenAprPct(params.roundTripCostPct, params.expectedHoldHours),
    entry: params.entryHurdleAprPct,
    exit: params.exitHurdleAprPct,
  };
};

/** @param {import("./carry-view.js").CarryView} view */
const currentSample = (view) => {
  if (view.apr === undefined) return undefined;
  return { at: view.fundingAt ?? view.instant, aprPct: view.apr };
};

/**
 * @param {import("@solos-sh/actions").CarryParams} params
 * @param {import("./carry-state.js").CarryState} state
 * @param {ReturnType<typeof measure>} math
 */
const baseState = (params, state, math) => ({
  market: params.market,
  trailingMeanAprPct: math.mean ?? "",
  entryHurdleAprPct: math.entry,
  exitHurdleAprPct: math.exit,
  breakEvenAprPct: math.breakEven,
  fundingSamples: math.samples,
  pauseAfter: false,
  naked: false,
  side: state.side === "" ? "flat" : state.side,
  ...copied(state),
});

/** @param {import("./carry-state.js").CarryState} state */
const copied = (state) => ({
  ...(state.entryAt !== null && { entryAt: state.entryAt }),
  ...(state.spotAmount !== "" && { spotAmount: state.spotAmount }),
  ...(state.perpNotionalUsd !== "" && { perpNotionalUsd: state.perpNotionalUsd }),
  ...(state.entryFundingAprPct !== "" && { entryFundingAprPct: state.entryFundingAprPct }),
});

/** @param {ReturnType<typeof measure>} measured */
const numbers = (measured) => ({
  mean: measured.mean ?? "0",
  entry: measured.entry,
  exit: measured.exit,
  breakEven: measured.breakEven,
});

/** @param {import("./carry-decide.js").ExitFrame & { state: import("./carry-state.js").CarryState }} frame */
const heldOrExit = (frame) => {
  if (!shouldExit(frame.math.mean, frame.params)) return hold(frame, true);
  return exitDecision(frame, exitSpotAmount(frame.state, frame.view, frame.params));
};

/** @param {import("./carry-decide.js").ExitFrame & { state: import("./carry-state.js").CarryState }} frame */
const flatDecision = (frame) => {
  if (!shouldEnter(frame.math.mean, frame.params, frame.math.breakEven)) return hold(frame, false);
  return enterDecision(frame);
};

/** @param {import("./carry-decide.js").ExitFrame} frame @returns {CarryDecision} */
const enterDecision = (frame) => {
  const sized = sizeEntry(frame.params, frame.view);
  if ("failure" in sized) return failed(frame, sized.failure, false);
  if (frame.view.mark === undefined) return failed(frame, priceFailure(), false);
  const blocked = entryFundingBlock(frame.view, frame.params, sized.sized);
  if (blocked !== undefined) return failed(frame, blocked, false);
  return entered(frame, frame.view.mark, sized.sized);
};

/**
 * @param {import("./carry-decide.js").ExitFrame} frame
 * @param {string} mark
 * @param {import("./carry-plan.js").Sized} sized
 * @returns {CarryDecision}
 */
const entered = (frame, mark, sized) => ({
  actions: enterActions(frame.params, mark, sized),
  state: {
    ...frame.base,
    reason: "enter",
    side: "short",
    naked: false,
    pauseAfter: false,
    spotAmount: sized.spot,
    perpNotionalUsd: sized.micro,
    entryAt: frame.view.instant,
    entryFundingAprPct: frame.math.mean,
  },
  note: carryNote("enter", frame.math, false),
});

/**
 * @param {import("./carry-decide.js").ExitFrame} frame
 * @param {boolean} exiting
 * @returns {CarryDecision}
 */
const hold = (frame, exiting) => ({
  actions: [],
  state: { ...frame.base, reason: "hold", pauseAfter: false, naked: false },
  note: carryNote("hold", frame.math, exiting),
});

const priceFailure = () => ({
  reason: "mark or mint price is missing",
  remedy: "wait for a positive USD price for the spot mint and the quote mint",
});
