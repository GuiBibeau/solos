// @ts-check
import { compareDecimal, mulDecimal, subtractDecimal } from "./decimal.js";

const PRICE = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const BPS_SCALE = "10000";

/**
 * @typedef {{
 *   readonly bestPriceUsd?: string;
 *   readonly firedAt?: number | null;
 * }} TriggerState
 */

/**
 * @typedef {{
 *   readonly actions: ReadonlyArray<import("@solos-sh/actions").Action>;
 *   readonly state: TriggerState;
 *   readonly note: string;
 *   readonly revert?: TriggerState;
 *   readonly skip?: { readonly reason: string; readonly remedy: string };
 * }} TriggerDecision
 */

/** Observations a trigger Tick reads: the USD price and the quote's own timestamp. */
export const TRIGGER_OBSERVATIONS = ["price", "priceAt"];

/** @param {unknown} value @returns {TriggerState} */
export const readTriggerState = (value) => {
  const row = recordOf(value);
  if (row === undefined) return {};
  return {
    ...(typeof row.bestPriceUsd === "string" && { bestPriceUsd: row.bestPriceUsd }),
    ...(typeof row.firedAt === "number" && { firedAt: row.firedAt }),
  };
};

/**
 * State saved on the Tick. A fire commits only when the Intent settles.
 * @param {{ readonly state?: unknown; readonly revert?: unknown }} decision
 * @param {string} outcome
 */
export const persistedState = (decision, outcome) => {
  if (decision.revert === undefined) return decision.state;
  if (outcome === "executed") return decision.state;
  if (outcome === "in_flight") return inFlightState(decision);
  return readTriggerState(decision.revert);
};

/**
 * Drop a pending fire when recovery closes the Tick as anything but executed.
 * @param {unknown} state
 * @param {string} outcome
 * @returns {import("./tick.js").Tick["state"]}
 */
export const stateAfterOutcome = (state, outcome) => {
  const row = recordOf(state);
  if (row === undefined) return undefined;
  if (outcome === "executed") return readTriggerState(row);
  if (outcome !== "in_flight" && row.armed !== undefined) return readTriggerState(row.armed);
  return /** @type {import("./tick.js").Tick["state"]} */ (state);
};

/**
 * Pure trigger evaluation. Decimal strings only. A stale or missing price leaves state as it was.
 * @param {import("@solos-sh/actions").TriggerParams} params
 * @param {Readonly<Record<string, string | number>>} observations
 * @param {unknown} state
 * @returns {TriggerDecision}
 */
export const evaluateTrigger = (params, observations, state) => {
  const prior = readTriggerState(state);
  const price = usablePrice(observations);
  if (price === undefined) return skipped(prior, missingSkip(observations));
  const stale = freshness(observations);
  if (stale !== undefined) return skipped(prior, stale);
  if (isCooling(params, prior, observations)) return held(prior, "trigger is cooling down");
  return judged({ params, price, prior, now: instantOf(observations) });
};

/**
 * @typedef {{
 *   readonly params: import("@solos-sh/actions").TriggerParams;
 *   readonly price: string;
 *   readonly prior: TriggerState;
 *   readonly now: number;
 * }} View
 */

/** @param {unknown} value */
const recordOf = (value) =>
  typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : undefined;

/** @param {{ readonly state?: unknown; readonly revert?: unknown }} decision */
const inFlightState = (decision) => ({
  ...readTriggerState(decision.state),
  armed: readTriggerState(decision.revert),
});

/** @param {Readonly<Record<string, string | number>>} observations */
const usablePrice = (observations) => {
  const price = observations.price;
  if (typeof price !== "string" || !PRICE.test(price)) return undefined;
  return price;
};

/** @param {Readonly<Record<string, string | number>>} observations */
const missingSkip = (observations) =>
  observations.price === undefined
    ? {
        reason: "price observation is missing",
        remedy: "retry when the price feed returns a USD price",
      }
    : {
        reason: "price observation is not a decimal string",
        remedy: "retry when the price feed returns a USD price",
      };

/** @param {Readonly<Record<string, string | number>>} observations */
const freshness = (observations) => {
  if (typeof observations.stalenessMs !== "number") return undefined;
  const at = observations.priceAt;
  const now = observations.instant;
  if (typeof at !== "number" || typeof now !== "number") {
    return {
      reason: "price observation has no timestamp",
      remedy: "retry when the price feed returns a timestamped quote",
    };
  }
  if (now - at > observations.stalenessMs) {
    return {
      reason: "price is older than the staleness limit",
      remedy: "retry when the price feed returns a newer quote",
    };
  }
  return undefined;
};

/**
 * @param {import("@solos-sh/actions").TriggerParams} params
 * @param {TriggerState} prior
 * @param {Readonly<Record<string, string | number>>} observations
 */
const isCooling = (params, prior, observations) => {
  if (params.once !== false || typeof prior.firedAt !== "number") return false;
  return instantOf(observations) < prior.firedAt + (params.cooldown ?? 0);
};

/** @param {Readonly<Record<string, string | number>>} observations */
const instantOf = (observations) =>
  typeof observations.instant === "number" ? observations.instant : 0;

/**
 * @param {TriggerState} prior
 * @param {{ readonly reason: string; readonly remedy: string }} skip
 * @returns {TriggerDecision}
 */
const skipped = (prior, skip) => ({
  actions: [],
  state: prior,
  note: skip.reason,
  skip,
});

/** @param {TriggerState} prior @param {string} note @returns {TriggerDecision} */
const held = (prior, note) => ({ actions: [], state: prior, note });

/** @param {View} view @returns {TriggerDecision} */
const judged = (view) => (view.params.trailingBps === undefined ? fixed(view) : trailing(view));

/** @param {View} view @returns {TriggerDecision} */
const fixed = (view) => {
  const threshold = view.params.priceUsd ?? view.price;
  const order = compareDecimal(view.price, threshold);
  const isMet = view.params.condition === "above" ? order > 0 : order < 0;
  if (!isMet)
    return held({ ...view.prior, bestPriceUsd: view.price }, "price is not beyond the line");
  return fire(view);
};

/** @param {View} view @returns {TriggerDecision} */
const trailing = (view) => {
  const best = view.prior.bestPriceUsd;
  if (best === undefined)
    return held({ ...view.prior, bestPriceUsd: view.price }, "trailing reference set");
  if (isBetter(view.params.condition, view.price, best)) {
    return held({ ...view.prior, bestPriceUsd: view.price }, "trailing reference moved");
  }
  if (!reached(view, best)) return held(view.prior, "price is inside the trailing distance");
  return fire(view);
};

/** @param {"above" | "below"} condition @param {string} price @param {string} best */
const isBetter = (condition, price, best) =>
  compareDecimal(price, best) === (condition === "below" ? 1 : -1);

/** @param {View} view @param {string} best */
const reached = (view, best) => {
  const condition = view.params.condition;
  const moved =
    condition === "below" ? compareDecimal(best, view.price) : compareDecimal(view.price, best);
  if (moved <= 0) return false;
  const distance =
    condition === "below" ? subtractDecimal(best, view.price) : subtractDecimal(view.price, best);
  const bps = String(view.params.trailingBps ?? 0);
  return compareDecimal(mulDecimal(distance, BPS_SCALE), mulDecimal(best, bps)) >= 0;
};

/** @param {View} view @returns {TriggerDecision} */
const fire = (view) => ({
  actions: [view.params.action],
  state: { bestPriceUsd: view.price, firedAt: view.now },
  revert: view.prior,
  note:
    view.params.trailingBps === undefined
      ? "price crossed the line"
      : "price moved through the trailing distance",
});
