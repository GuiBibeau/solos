// @ts-check
import { Context } from "effect";

/** Scope that blocks reserves for every strategy. A strategy id blocks only that strategy. */
export const GLOBAL_KILL_SCOPE = "global";

/**
 * @typedef {{
 *   readonly strategyId: string;
 *   readonly intentId: string;
 *   readonly notionalUsd: string;
 *   readonly mint: string;
 * }} ReserveRequest
 */

/** @typedef {{ readonly engaged: boolean; readonly reason: string | null }} KillSwitchStatus */

/**
 * @typedef {import("../../shared/domain/engine-errors.js").BoundsExceeded
 *   | import("../domain/errors.js").KillSwitchEngaged
 *   | import("../domain/errors.js").StrategyNotFound} ReserveError
 */

/**
 * Holds a Strategy's notional against its Bounds, and the kill switch beside it.
 * `intentId` is the idempotency key for the whole ledger: a repeat reserve returns the same
 * `reservationId` and does not count twice. `settle` replaces an open hold with the measured
 * spend. `release` frees an open hold. Each of those applies once; a later call leaves the
 * hold as the first one left it. An unknown reservation id is a defect. USD amounts are
 * decimal strings compared exactly. An engaged switch blocks new reserves only.
 * Daily spend is open holds plus settled amounts on the UTC day the hold was reserved.
 * @typedef {{
 *   readonly reserve: (
 *     request: ReserveRequest,
 *   ) => import("effect").Effect.Effect<{ readonly reservationId: string }, ReserveError>;
 *   readonly settle: (
 *     reservationId: string,
 *     actualUsd: string,
 *   ) => import("effect").Effect.Effect<void>;
 *   readonly release: (reservationId: string) => import("effect").Effect.Effect<void>;
 *   readonly engage: (input: {
 *     readonly scope: string;
 *     readonly reason: string;
 *   }) => import("effect").Effect.Effect<void>;
 *   readonly disengage: (scope: string) => import("effect").Effect.Effect<void>;
 *   readonly status: (scope: string) => import("effect").Effect.Effect<KillSwitchStatus>;
 * }} CapLedgerShape
 */

export const CapLedger = /** @type {Context.Tag<CapLedgerShape, CapLedgerShape>} */ (
  Context.GenericTag("@solos/strategy/CapLedger")
);
