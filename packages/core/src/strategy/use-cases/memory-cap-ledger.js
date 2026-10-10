// @ts-check
import { Effect, Layer } from "effect";
import { reserveRefusal, utcDay } from "../domain/cap-check.js";
import { addDecimal, compareDecimal, subtractDecimal } from "../domain/decimal.js";
import { CapLedger, GLOBAL_KILL_SCOPE } from "../ports/cap-ledger.js";

const EMPTY = Object.freeze(/** @type {readonly string[]} */ ([]));

/** @typedef {import("../domain/cap-check.js").ReserveFacts} ReserveFacts */
/** @typedef {import("../ports/cap-ledger.js").ReserveRequest} ReserveRequest */
/** @typedef {import("@solos-sh/actions").StrategyBounds} StrategyBounds */

/**
 * Bounds and the clock are injected. They are not part of the port.
 * `boundsFor` returns undefined when the Strategy has no bounds loaded.
 * `engineMints` empty means any mint; a non-empty list is the Engine allowlist.
 * @typedef {{
 *   readonly boundsFor: (strategyId: string) => StrategyBounds | undefined;
 *   readonly now?: () => number;
 *   readonly engineMints?: () => readonly string[];
 * }} MemoryCapLedgerOptions
 */

/**
 * @typedef {"open" | "settled" | "released"} HoldStatus
 * @typedef {{
 *   readonly reservationId: string;
 *   readonly strategyId: string;
 *   readonly tickId: string;
 *   readonly intentId: string;
 *   readonly notionalUsd: string;
 *   readonly actualUsd: string | null;
 *   readonly overshootUsd: string | null;
 *   readonly day: string;
 *   readonly status: HoldStatus;
 * }} Hold
 * @typedef {{
 *   reservations: Map<string, Hold>;
 *   byIntent: Map<string, string>;
 *   kills: Map<string, string>;
 *   next: number;
 * }} LedgerState
 */

/**
 * In-memory cap ledger. Tests and the tick runner use it until a SQLite adapter joins the port.
 * State lives in the process that built the layer.
 * @param {MemoryCapLedgerOptions} options
 */
export const memoryCapLedger = (options) => Layer.sync(CapLedger, () => createLedger(options));

/** @param {MemoryCapLedgerOptions} options @returns {import("../ports/cap-ledger.js").CapLedgerShape} */
const createLedger = (options) => {
  /** @type {LedgerState} */
  const state = { reservations: new Map(), byIntent: new Map(), kills: new Map(), next: 0 };
  return {
    reserve: (request) => reserve(state, options, request),
    settle: (reservationId, actualUsd) => settle(state, reservationId, actualUsd),
    release: (reservationId) => release(state, reservationId),
    engage: (input) => Effect.sync(() => void state.kills.set(input.scope, input.reason)),
    disengage: (scope) => Effect.sync(() => void state.kills.delete(scope)),
    status: (scope) => Effect.sync(() => killStatus(state, scope)),
  };
};

/** @param {LedgerState} state @param {string} scope */
const killStatus = (state, scope) => {
  const reason = state.kills.get(scope);
  if (reason === undefined) return { engaged: false, reason: null };
  return { engaged: true, reason };
};

/**
 * @param {LedgerState} state
 * @param {MemoryCapLedgerOptions} options
 * @param {ReserveRequest} request
 */
const reserve = (state, options, request) =>
  Effect.gen(function* () {
    const existing = state.byIntent.get(request.intentId);
    if (existing !== undefined) return { reservationId: existing };
    const now = options.now?.() ?? Date.now();
    const refusal = reserveRefusal(facts(state, options, { request, now }));
    if (refusal) return yield* refusal;
    return hold(state, request, now);
  });

/**
 * @param {LedgerState} state
 * @param {MemoryCapLedgerOptions} options
 * @param {{ request: ReserveRequest; now: number }} input
 * @returns {ReserveFacts}
 */
const facts = (state, options, input) => ({
  strategyId: input.request.strategyId,
  notionalUsd: input.request.notionalUsd,
  mint: input.request.mint,
  now: input.now,
  spentUsd: spentOn(state, input.request.strategyId, utcDay(input.now)),
  tickUsd: tickTotal(state, input.request),
  bounds: options.boundsFor(input.request.strategyId),
  engineMints: options.engineMints?.() ?? EMPTY,
  kill: killFor(state, input.request.strategyId),
});

/** @param {LedgerState} state @param {string} strategyId */
const killFor = (state, strategyId) => {
  const globalReason = state.kills.get(GLOBAL_KILL_SCOPE);
  if (globalReason !== undefined) return { scope: GLOBAL_KILL_SCOPE, reason: globalReason };
  const own = state.kills.get(strategyId);
  if (own !== undefined) return { scope: strategyId, reason: own };
  return undefined;
};

/** @param {LedgerState} state @param {ReserveRequest} request @param {number} now */
const hold = (state, request, now) => {
  state.next += 1;
  const reservationId = `res_${state.next}`;
  state.reservations.set(reservationId, {
    reservationId,
    strategyId: request.strategyId,
    tickId: request.tickId,
    intentId: request.intentId,
    notionalUsd: request.notionalUsd,
    actualUsd: null,
    overshootUsd: null,
    day: utcDay(now),
    status: "open",
  });
  state.byIntent.set(request.intentId, reservationId);
  return { reservationId };
};

/** @param {Hold} row @param {string} strategyId @param {string} day */
const isCounted = (row, strategyId, day) =>
  row.strategyId === strategyId && row.day === day && row.status !== "released";

/** @param {Hold} row */
const countedAmount = (row) =>
  row.status === "settled" ? (row.actualUsd ?? "0") : row.notionalUsd;

/** @param {Hold} row @param {ReserveRequest} request */
const isOnTick = (row, request) =>
  row.strategyId === request.strategyId &&
  row.tickId === request.tickId &&
  row.status !== "released";

/** @param {LedgerState} state @param {ReserveRequest} request */
const tickTotal = (state, request) => {
  let total = "0";
  for (const row of state.reservations.values()) {
    if (isOnTick(row, request)) total = addDecimal(total, countedAmount(row));
  }
  return total;
};

/** @param {LedgerState} state @param {string} strategyId @param {string} day */
const spentOn = (state, strategyId, day) => {
  let total = "0";
  for (const row of state.reservations.values()) {
    if (isCounted(row, strategyId, day)) total = addDecimal(total, countedAmount(row));
  }
  return total;
};

/**
 * @param {LedgerState} state
 * @param {string} reservationId
 * @param {string} actualUsd
 */
const settle = (state, reservationId, actualUsd) =>
  Effect.gen(function* () {
    const row = state.reservations.get(reservationId);
    if (!row) return yield* Effect.die(new Error(`unknown reservation ${reservationId}`));
    if (row.status !== "open") return;
    if (actualUsd.startsWith("-")) {
      return yield* Effect.die(new Error("settled USD must be non-negative"));
    }
    const overshootUsd = overshoot(row.notionalUsd, actualUsd);
    state.reservations.set(reservationId, { ...row, status: "settled", actualUsd, overshootUsd });
    if (overshootUsd === null) return;
    state.kills.set(row.strategyId, exceededReason(overshootUsd));
    yield* Effect.logInfo("cap-ledger.settle-exceeded").pipe(
      Effect.annotateLogs({ reservationId, strategyId: row.strategyId, overshootUsd }),
    );
  });

/** @param {string} reserved @param {string} actual */
const overshoot = (reserved, actual) =>
  compareDecimal(actual, reserved) > 0 ? subtractDecimal(actual, reserved) : null;

/** @param {string} overshootUsd */
const exceededReason = (overshootUsd) =>
  `settle exceeded reservation: overshoot ${overshootUsd} USD`;

/** @param {LedgerState} state @param {string} reservationId */
const release = (state, reservationId) =>
  Effect.sync(() => {
    const row = known(state, reservationId);
    if (row.status !== "open") return;
    state.reservations.set(reservationId, { ...row, status: "released" });
  });

/** @param {LedgerState} state @param {string} reservationId */
const known = (state, reservationId) => {
  const row = state.reservations.get(reservationId);
  if (!row) throw new Error(`unknown reservation ${reservationId}`);
  return row;
};
