// @ts-check
import { Database } from "bun:sqlite";

/**
 * The first table of the engine database. One Intent is executed at most once.
 * States: `in_flight`, `settled` (payload is the ExecutionResult), `failed` (payload is the
 * error envelope). WAL so a reader can look an Intent up while a writer claims another.
 * @param {string} file
 */
export const openIntents = (file) => {
  const db = new Database(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS intents (
    intent_id TEXT PRIMARY KEY NOT NULL,
    state TEXT NOT NULL,
    payload TEXT
  )`);
  return db;
};

/**
 * Claim a new Intent, or return the row that already owns this id. The insert is atomic, so
 * two concurrent claims yield one `claimed` and one `in_flight`.
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 */
export const claimIntent = (db, intentId) => {
  const inserted = db
    .query(
      "INSERT INTO intents (intent_id, state, payload) VALUES (?, 'in_flight', NULL) ON CONFLICT(intent_id) DO NOTHING",
    )
    .run(intentId);
  if (inserted.changes === 1) return { state: /** @type {const} */ ("claimed"), intentId };
  return readIntent(db, intentId);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {unknown} result
 */
export const settleIntent = (db, intentId, result) => {
  db.query(
    "UPDATE intents SET state = 'settled', payload = ? WHERE intent_id = ? AND state = 'in_flight'",
  ).run(JSON.stringify(result), intentId);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {Record<string, unknown>} error
 */
export const failIntent = (db, intentId, error) => {
  db.query(
    "UPDATE intents SET state = 'failed', payload = ? WHERE intent_id = ? AND state = 'in_flight'",
  ).run(JSON.stringify(error), intentId);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 */
export const readIntent = (db, intentId) => {
  const row = db.query("SELECT state, payload FROM intents WHERE intent_id = ?").get(intentId);
  if (row === null) return { state: /** @type {const} */ ("missing"), intentId };
  return shapeRow(intentId, /** @type {{ state: string; payload: string | null }} */ (row));
};

/**
 * @param {string} intentId
 * @param {{ state: string; payload: string | null }} row
 */
const shapeRow = (intentId, row) => {
  if (row.state === "settled") {
    return { state: /** @type {const} */ ("settled"), intentId, result: parsePayload(row.payload) };
  }
  if (row.state === "failed") {
    return { state: /** @type {const} */ ("failed"), intentId, error: parsePayload(row.payload) };
  }
  return { state: /** @type {const} */ ("in_flight"), intentId };
};

/** @param {string | null} payload */
const parsePayload = (payload) => (payload === null ? undefined : JSON.parse(payload));
