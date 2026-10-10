// @ts-check
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { addDecimal, compareDecimal } from "./decimal.js";
import { KillSwitchEngaged, StrategyNotFound } from "./errors.js";

/** @typedef {import("@solos-sh/actions").StrategyBounds} StrategyBounds */

/**
 * Facts a reserve is judged against. `spentUsd` is open holds plus settled amounts for this
 * Strategy on the UTC day of `now`. `tickUsd` is the same kind of sum for reserves that share
 * this reserve's `tickId`. `kill` is set when the global switch or the per-Strategy switch
 * is engaged; global wins.
 * @typedef {{
 *   readonly strategyId: string;
 *   readonly notionalUsd: string;
 *   readonly mint: string;
 *   readonly now: number;
 *   readonly spentUsd: string;
 *   readonly tickUsd: string;
 *   readonly bounds: StrategyBounds | undefined;
 *   readonly engineMints: readonly string[];
 *   readonly kill: { readonly scope: string; readonly reason: string } | undefined;
 * }} ReserveFacts
 */

/** @typedef {ReserveFacts & { readonly bounds: StrategyBounds }} KnownBounds */

/**
 * @typedef {{
 *   readonly bound: string;
 *   readonly limit: string;
 *   readonly requested: string;
 *   readonly reason: string;
 *   readonly remedy: string;
 * }} BoundDetail
 */

/** UTC calendar day, `YYYY-MM-DD`, for an epoch millisecond. The cap window rolls here. @param {number} epochMs */
export const utcDay = (epochMs) => new Date(epochMs).toISOString().slice(0, 10);

/**
 * Refusal for a new reserve, or undefined when every bound holds. An exact cap is allowed;
 * one unit past it is not. `expiresAt` stops authorizing spends at that millisecond.
 * @param {ReserveFacts} facts
 * @returns {BoundsExceeded | KillSwitchEngaged | StrategyNotFound | undefined}
 */
export const reserveRefusal = (facts) => {
  const killed = killRefusal(facts);
  if (killed) return killed;
  if (!facts.bounds) return new StrategyNotFound({ id: facts.strategyId });
  return boundRefusal(/** @type {KnownBounds} */ (facts));
};

/** @param {ReserveFacts} facts @returns {KillSwitchEngaged | undefined} */
const killRefusal = (facts) => {
  if (!facts.kill) return undefined;
  const { scope, reason } = facts.kill;
  return new KillSwitchEngaged({
    scope,
    reason: `kill switch is engaged for ${scope}: ${reason}`,
  });
};

/** @param {KnownBounds} facts */
const boundRefusal = (facts) =>
  expired(facts) ?? mintRefusal(facts) ?? perTick(facts) ?? daily(facts);

/** @param {KnownBounds} facts @param {BoundDetail} detail */
const exceeded = (facts, detail) => new BoundsExceeded({ ...detail, scope: facts.strategyId });

/** @param {KnownBounds} facts @returns {BoundsExceeded | undefined} */
const expired = (facts) => {
  const at = facts.bounds.expiresAt;
  if (at === null || facts.now < at) return undefined;
  return exceeded(facts, {
    bound: "expiresAt",
    limit: String(at),
    requested: String(facts.now),
    reason: `bounds stopped authorizing spends at ${at}`,
    remedy: "raise expiresAt or register a strategy whose bounds still authorize spends",
  });
};

/**
 * @param {KnownBounds} facts
 * @param {readonly string[]} list
 * @param {{ reason: (mint: string) => string; remedy: string }} copy
 * @returns {BoundsExceeded | undefined}
 */
const listRefusal = (facts, list, copy) => {
  if (list.length === 0 || list.includes(facts.mint)) return undefined;
  return exceeded(facts, {
    bound: "allowedMints",
    limit: list.join(","),
    requested: facts.mint,
    reason: copy.reason(facts.mint),
    remedy: copy.remedy,
  });
};

/** @param {KnownBounds} facts @returns {BoundsExceeded | undefined} */
const mintRefusal = (facts) =>
  listRefusal(facts, facts.engineMints, {
    reason: (mint) => `mint ${mint} is outside the Engine allowlist`,
    remedy: "reserve a mint the Engine allowlist permits",
  }) ??
  listRefusal(facts, facts.bounds.allowedMints, {
    reason: (mint) => `mint ${mint} is outside the Strategy allowlist`,
    remedy: "reserve a mint on the Strategy allowlist",
  });

/** @param {KnownBounds} facts @returns {BoundsExceeded | undefined} */
const perTick = (facts) => {
  const limit = facts.bounds.maxNotionalPerTickUsd;
  const negative = facts.notionalUsd.startsWith("-");
  const requested = negative ? facts.notionalUsd : addDecimal(facts.tickUsd, facts.notionalUsd);
  if (!negative && compareDecimal(requested, limit) <= 0) return undefined;
  return exceeded(facts, {
    bound: "maxNotionalPerTickUsd",
    limit,
    requested,
    reason: `tick total ${requested} USD is above the per-tick cap of ${limit} USD`,
    remedy: "lower the notional or raise maxNotionalPerTickUsd",
  });
};

/** @param {KnownBounds} facts @returns {BoundsExceeded | undefined} */
const daily = (facts) => {
  const limit = facts.bounds.maxDailySpendUsd;
  const requested = facts.notionalUsd;
  if (compareDecimal(addDecimal(facts.spentUsd, requested), limit) <= 0) return undefined;
  return exceeded(facts, {
    bound: "maxDailySpendUsd",
    limit,
    requested,
    reason: `daily spend cap is ${limit} USD and this reserve requests ${requested} USD`,
    remedy: "lower the amount, wait for the next UTC day, or raise maxDailySpendUsd",
  });
};
