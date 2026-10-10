// @ts-check
import {
  CapLedger,
  GLOBAL_KILL_SCOPE,
  compareDecimal,
  reserveRefusal,
  subtractDecimal,
  utcDay,
} from "@solos/core";
import { Effect, Layer } from "effect";
import {
  capTransaction,
  clearKill,
  holdById,
  holdByIntent,
  insertHold,
  killReason,
  migrateCapLedger,
  sumWhere,
  writeKill,
  writeReleased,
  writeSettled,
} from "./cap-ledger-store.js";

const EMPTY = Object.freeze(/** @type {readonly string[]} */ ([]));

/** @typedef {import("@solos/core/strategy").MemoryCapLedgerOptions} LedgerOptions */
/** @typedef {import("@solos/core/strategy").ReserveRequest} ReserveRequest */
/** @typedef {Exclude<ReturnType<typeof reserveRefusal>, undefined>} ReserveRefusal */

/**
 * @typedef {{ readonly reservationId: string; readonly refusal?: undefined }
 *   | { readonly refusal: ReserveRefusal; readonly reservationId?: undefined }} ReserveOutcome
 */

/**
 * Durable cap ledger on the Engine database. Bounds, the clock, and the Engine allowlist are
 * injected the same way as `memoryCapLedger`. Each mutation commits in one transaction.
 * @param {import("bun:sqlite").Database} db
 * @param {LedgerOptions} options
 */
export const sqliteCapLedger = (db, options) => {
  migrateCapLedger(db);
  return Layer.sync(CapLedger, () => service(db, options));
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {LedgerOptions} options
 * @returns {import("@solos/core/strategy").CapLedgerShape}
 */
const service = (db, options) => ({
  reserve: (request) => reserve(db, options, request),
  settle: (reservationId, actualUsd) => settle(db, reservationId, actualUsd),
  release: (reservationId) => release(db, reservationId),
  engage: (input) =>
    Effect.sync(() => capTransaction(db, () => writeKill(db, input.scope, input.reason))),
  disengage: (scope) => Effect.sync(() => capTransaction(db, () => clearKill(db, scope))),
  status: (scope) => Effect.sync(() => killStatus(db, scope)),
});

/** @param {import("bun:sqlite").Database} db @param {string} scope */
const killStatus = (db, scope) => {
  const reason = killReason(db, scope);
  if (reason === undefined) return { engaged: false, reason: null };
  return { engaged: true, reason };
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {LedgerOptions} options
 * @param {ReserveRequest} request
 */
const reserve = (db, options, request) =>
  Effect.gen(function* () {
    const outcome = capTransaction(db, () => decideReserve(db, options, request));
    if (outcome.refusal) return yield* outcome.refusal;
    return { reservationId: outcome.reservationId };
  });

/**
 * @param {import("bun:sqlite").Database} db
 * @param {LedgerOptions} options
 * @param {ReserveRequest} request
 * @returns {ReserveOutcome}
 */
const decideReserve = (db, options, request) => {
  const existing = holdByIntent(db, request.intentId);
  if (existing) return { reservationId: existing.reservation_id };
  const now = options.now?.() ?? Date.now();
  const refusal = reserveRefusal(factsFor(db, options, { request, now }));
  if (refusal) return { refusal };
  return { reservationId: insertHold(db, held(request, utcDay(now))) };
};

/**
 * @param {ReserveRequest} request
 * @param {string} day
 */
const held = (request, day) => ({
  strategyId: request.strategyId,
  tickId: request.tickId,
  intentId: request.intentId,
  mint: request.mint,
  notionalUsd: request.notionalUsd,
  day,
});

/**
 * @param {import("bun:sqlite").Database} db
 * @param {LedgerOptions} options
 * @param {{ request: ReserveRequest; now: number }} input
 */
const factsFor = (db, options, input) => ({
  strategyId: input.request.strategyId,
  notionalUsd: input.request.notionalUsd,
  mint: input.request.mint,
  now: input.now,
  spentUsd: sumWhere(db, "strategy_id = ? AND day = ?", [
    input.request.strategyId,
    utcDay(input.now),
  ]),
  tickUsd: sumWhere(db, "strategy_id = ? AND tick_id = ?", [
    input.request.strategyId,
    input.request.tickId,
  ]),
  bounds: options.boundsFor(input.request.strategyId),
  engineMints: options.engineMints?.() ?? EMPTY,
  kill: killFor(db, input.request.strategyId),
});

/** @param {import("bun:sqlite").Database} db @param {string} strategyId */
const killFor = (db, strategyId) => {
  const globalReason = killReason(db, GLOBAL_KILL_SCOPE);
  if (globalReason !== undefined) return { scope: GLOBAL_KILL_SCOPE, reason: globalReason };
  const own = killReason(db, strategyId);
  if (own !== undefined) return { scope: strategyId, reason: own };
  return undefined;
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} reservationId
 * @param {string} actualUsd
 */
const settle = (db, reservationId, actualUsd) =>
  Effect.gen(function* () {
    const outcome = capTransaction(db, () => decideSettle(db, reservationId, actualUsd));
    if (outcome.missing)
      return yield* Effect.die(new Error(`unknown reservation ${reservationId}`));
    if (outcome.negative) return yield* Effect.die(new Error("settled USD must be non-negative"));
    if (!outcome.overshootUsd) return;
    yield* Effect.logInfo("cap-ledger.settle-exceeded").pipe(
      Effect.annotateLogs({
        reservationId,
        strategyId: outcome.strategyId,
        overshootUsd: outcome.overshootUsd,
      }),
    );
  });

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} reservationId
 * @param {string} actualUsd
 */
const decideSettle = (db, reservationId, actualUsd) => {
  const row = holdById(db, reservationId);
  if (!row) return { missing: /** @type {const} */ (true) };
  if (row.status !== "open") return { done: /** @type {const} */ (true) };
  if (actualUsd.startsWith("-")) return { negative: /** @type {const} */ (true) };
  const overshootUsd = overshoot(row.notional_usd, actualUsd);
  writeSettled(db, { reservationId, actualUsd, overshootUsd });
  if (overshootUsd !== null) writeKill(db, row.strategy_id, exceededReason(overshootUsd));
  return { overshootUsd, strategyId: row.strategy_id };
};

/** @param {string} reserved @param {string} actual */
const overshoot = (reserved, actual) =>
  compareDecimal(actual, reserved) > 0 ? subtractDecimal(actual, reserved) : null;

/** @param {string} overshootUsd */
const exceededReason = (overshootUsd) =>
  `settle exceeded reservation: overshoot ${overshootUsd} USD`;

/** @param {import("bun:sqlite").Database} db @param {string} reservationId */
const release = (db, reservationId) =>
  Effect.sync(() => {
    const missing = capTransaction(db, () => decideRelease(db, reservationId));
    if (missing) throw new Error(`unknown reservation ${reservationId}`);
  });

/** @param {import("bun:sqlite").Database} db @param {string} reservationId */
const decideRelease = (db, reservationId) => {
  const row = holdById(db, reservationId);
  if (!row) return true;
  if (row.status === "open") writeReleased(db, reservationId);
  return false;
};
