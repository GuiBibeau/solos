// @ts-check
import { Database } from "bun:sqlite";

/**
 * The first table of the engine database. One Intent is executed at most once.
 * States: `in_flight`, `settled` (payload is the ExecutionResult), `failed` (payload is the
 * error envelope). `signature` and `last_valid_block_height` are written at sign time, before
 * broadcast, so a restart can look the send up. WAL so a reader can look an Intent up while a
 * writer claims another.
 * @param {string} file
 */
export const openIntents = (file) => {
  const db = new Database(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS intents (
    intent_id TEXT PRIMARY KEY NOT NULL,
    state TEXT NOT NULL,
    payload TEXT,
    signature TEXT,
    last_valid_block_height TEXT,
    action TEXT,
    simulated INTEGER NOT NULL DEFAULT 1
  )`);
  migrate(db);
  return db;
};

/** @param {import("bun:sqlite").Database} db */
const migrate = (db) => {
  const present = new Set(columnNames(db));
  for (const [name, sql] of ADDED) {
    if (!present.has(name)) db.exec(sql);
  }
};

/** @param {import("bun:sqlite").Database} db */
const columnNames = (db) =>
  db
    .query("PRAGMA table_info(intents)")
    .all()
    .map((row) => /** @type {{ name: string }} */ (row).name);

const ADDED = /** @type {const} */ ([
  ["signature", "ALTER TABLE intents ADD COLUMN signature TEXT"],
  ["last_valid_block_height", "ALTER TABLE intents ADD COLUMN last_valid_block_height TEXT"],
  ["action", "ALTER TABLE intents ADD COLUMN action TEXT"],
  ["simulated", "ALTER TABLE intents ADD COLUMN simulated INTEGER NOT NULL DEFAULT 1"],
]);

/**
 * Claim a new Intent, or return the row that already owns this id. The insert is atomic, so
 * two concurrent claims yield one `claimed` and one `in_flight`.
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {{ readonly action?: unknown; readonly simulated?: boolean }} [meta]
 */
export const claimIntent = (db, intentId, meta) => {
  const inserted = db
    .query(
      `INSERT INTO intents (intent_id, state, payload, action, simulated)
       VALUES (?, 'in_flight', NULL, ?, ?) ON CONFLICT(intent_id) DO NOTHING`,
    )
    .run(intentId, storedAction(meta), meta?.simulated === false ? 0 : 1);
  if (inserted.changes === 1) return { state: /** @type {const} */ ("claimed"), intentId };
  return readIntent(db, intentId);
};

/**
 * The signature exists and has not been broadcast yet. A later crash can look it up.
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {{ readonly signature: string; readonly lastValidBlockHeight: bigint }} signed
 */
export const recordSigned = (db, intentId, signed) => {
  db.query(
    `UPDATE intents SET signature = ?, last_valid_block_height = ?
     WHERE intent_id = ? AND state = 'in_flight' AND signature IS NULL`,
  ).run(String(signed.signature), signed.lastValidBlockHeight.toString(), intentId);
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

/** @param {import("bun:sqlite").Database} db */
export const inFlightIds = (db) =>
  db
    .query("SELECT intent_id FROM intents WHERE state = 'in_flight'")
    .all()
    .map((row) => /** @type {{ intent_id: string }} */ (row).intent_id);

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 */
export const readIntent = (db, intentId) => {
  const row = db
    .query(
      `SELECT state, payload, signature, last_valid_block_height, action, simulated
       FROM intents WHERE intent_id = ?`,
    )
    .get(intentId);
  if (row === null) return { state: /** @type {const} */ ("missing"), intentId };
  return shapeRow(intentId, /** @type {IntentSql} */ (row));
};

/** @param {{ readonly action?: unknown } | undefined} meta */
const storedAction = (meta) => (meta?.action === undefined ? null : JSON.stringify(meta.action));

/**
 * @typedef {{
 *   state: string;
 *   payload: string | null;
 *   signature: string | null;
 *   last_valid_block_height: string | null;
 *   action: string | null;
 *   simulated: number | null;
 * }} IntentSql
 */

/**
 * @param {string} intentId
 * @param {IntentSql} row
 */
const shapeRow = (intentId, row) => {
  if (row.state === "settled") {
    return { state: /** @type {const} */ ("settled"), intentId, result: parsePayload(row.payload) };
  }
  if (row.state === "failed") {
    return { state: /** @type {const} */ ("failed"), intentId, error: parsePayload(row.payload) };
  }
  return {
    state: /** @type {const} */ ("in_flight"),
    intentId,
    signature: row.signature,
    lastValidBlockHeight: row.last_valid_block_height,
    action: parsePayload(row.action),
    simulated: row.simulated !== 0,
  };
};

/** @param {string | null} payload */
const parsePayload = (payload) => (payload === null ? undefined : JSON.parse(payload));
