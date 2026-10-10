// @ts-check
import { addDecimal } from "@solos/core";

/**
 * @typedef {{
 *   reservation_id: string;
 *   strategy_id: string;
 *   tick_id: string;
 *   intent_id: string;
 *   mint: string;
 *   notional_usd: string;
 *   actual_usd: string | null;
 *   overshoot_usd: string | null;
 *   day: string;
 *   status: string;
 * }} CapRow
 */

const ROW = `reservation_id, strategy_id, tick_id, intent_id, mint, notional_usd,
  actual_usd, overshoot_usd, day, status`;

/** @param {import("bun:sqlite").Database} db */
export const migrateCapLedger = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS cap_reservations (
    reservation_id TEXT PRIMARY KEY NOT NULL,
    strategy_id TEXT NOT NULL,
    tick_id TEXT NOT NULL,
    intent_id TEXT NOT NULL UNIQUE,
    mint TEXT NOT NULL,
    notional_usd TEXT NOT NULL,
    actual_usd TEXT,
    overshoot_usd TEXT,
    day TEXT NOT NULL,
    status TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS cap_kills (
    scope TEXT PRIMARY KEY NOT NULL,
    reason TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS cap_seq (
    id INTEGER PRIMARY KEY NOT NULL,
    next INTEGER NOT NULL
  )`);
};

/**
 * One transaction. A throw rolls every write in `body` back, including the reservation id.
 * @template A
 * @param {import("bun:sqlite").Database} db
 * @param {() => A} body
 * @returns {A}
 */
export const capTransaction = (db, body) => db.transaction(body)();

/** @param {import("bun:sqlite").Database} db */
export const hasCapTables = (db) =>
  db
    .query("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'cap_reservations'")
    .get() !== null;

/** @param {import("bun:sqlite").Database} db @param {string} intentId @returns {CapRow | undefined} */
export const holdByIntent = (db, intentId) =>
  one(db, `SELECT ${ROW} FROM cap_reservations WHERE intent_id = ?`, intentId);

/** @param {import("bun:sqlite").Database} db @param {string} reservationId @returns {CapRow | undefined} */
export const holdById = (db, reservationId) =>
  one(db, `SELECT ${ROW} FROM cap_reservations WHERE reservation_id = ?`, reservationId);

/** @param {import("bun:sqlite").Database} db @returns {CapRow[]} */
export const listOpenHolds = (db) =>
  /** @type {CapRow[]} */ (
    db.query(`SELECT ${ROW} FROM cap_reservations WHERE status = 'open'`).all()
  );

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} where
 * @param {readonly string[]} params
 */
export const sumWhere = (db, where, params) => {
  const rows = /** @type {CapRow[]} */ (
    db
      .query(`SELECT ${ROW} FROM cap_reservations WHERE ${where} AND status IN ('open', 'settled')`)
      .all(...params)
  );
  let total = "0";
  for (const row of rows) total = addDecimal(total, counted(row));
  return total;
};

/** @param {CapRow} row */
const counted = (row) => (row.status === "settled" ? (row.actual_usd ?? "0") : row.notional_usd);

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} sql
 * @param {string} id
 * @returns {CapRow | undefined}
 */
const one = (db, sql, id) => {
  const row = db.query(sql).get(id);
  return row === null ? undefined : /** @type {CapRow} */ (row);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ strategyId: string; tickId: string; intentId: string; mint: string; notionalUsd: string; day: string }} hold
 */
export const insertHold = (db, hold) => {
  const reservationId = nextReservation(db);
  db.query(
    `INSERT INTO cap_reservations (
      reservation_id, strategy_id, tick_id, intent_id, mint, notional_usd, day, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
  ).run(
    reservationId,
    hold.strategyId,
    hold.tickId,
    hold.intentId,
    hold.mint,
    hold.notionalUsd,
    hold.day,
  );
  return reservationId;
};

/** @param {import("bun:sqlite").Database} db */
const nextReservation = (db) => {
  const row = db.query("SELECT next FROM cap_seq WHERE id = 1").get();
  const next = Number(/** @type {{ next?: number } | null} */ (row)?.next ?? 0) + 1;
  db.query(
    "INSERT INTO cap_seq (id, next) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET next = excluded.next",
  ).run(next);
  return `res_${next}`;
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ reservationId: string; actualUsd: string; overshootUsd: string | null }} settled
 */
export const writeSettled = (db, settled) => {
  db.query(
    `UPDATE cap_reservations SET status = 'settled', actual_usd = ?, overshoot_usd = ?
     WHERE reservation_id = ? AND status = 'open'`,
  ).run(settled.actualUsd, settled.overshootUsd, settled.reservationId);
};

/** @param {import("bun:sqlite").Database} db @param {string} reservationId */
export const writeReleased = (db, reservationId) => {
  db.query(
    "UPDATE cap_reservations SET status = 'released' WHERE reservation_id = ? AND status = 'open'",
  ).run(reservationId);
};

/** @param {import("bun:sqlite").Database} db @param {string} scope @returns {string | undefined} */
export const killReason = (db, scope) => {
  const row = db.query("SELECT reason FROM cap_kills WHERE scope = ?").get(scope);
  if (row === null) return undefined;
  return /** @type {{ reason: string }} */ (row).reason;
};

/** @param {import("bun:sqlite").Database} db @param {string} scope @param {string} reason */
export const writeKill = (db, scope, reason) => {
  db.query(
    "INSERT INTO cap_kills (scope, reason) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET reason = excluded.reason",
  ).run(scope, reason);
};

/** @param {import("bun:sqlite").Database} db @param {string} scope */
export const clearKill = (db, scope) => {
  db.query("DELETE FROM cap_kills WHERE scope = ?").run(scope);
};
