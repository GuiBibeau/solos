// @ts-check
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * The id CLI and MCP retries reuse. One open row per action fingerprint, written before the
 * first request. A lost response leaves it, so the next execute of the same action sends the
 * same `intentId`. Observing a terminal result removes it, and the next execute is a new Intent.
 * @param {string} file
 */
const openDb = (file) => {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(`CREATE TABLE IF NOT EXISTS caller_intents (
    fingerprint TEXT PRIMARY KEY NOT NULL,
    intent_id TEXT NOT NULL
  )`);
  return db;
};

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {boolean} skipSimulation
 */
export const actionFingerprint = (action, skipSimulation) =>
  createHash("sha256").update(JSON.stringify({ skipSimulation, action })).digest("hex");

/**
 * The open id for this action, or a new one when none is open. Two callers racing insert once.
 * @param {string} file
 * @param {string} fingerprint
 */
export const callerIntentId = (file, fingerprint) => {
  const db = openDb(file);
  try {
    const existing = readId(db, fingerprint);
    if (existing !== undefined) return existing;
    const intentId = crypto.randomUUID();
    const inserted = db
      .query(
        "INSERT INTO caller_intents (fingerprint, intent_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      )
      .run(fingerprint, intentId);
    return inserted.changes === 1 ? intentId : (readId(db, fingerprint) ?? intentId);
  } finally {
    db.close();
  }
};

/**
 * Put this id back. A duplicate that lost the race to a terminal result still retries as itself.
 * @param {string} file
 * @param {string} fingerprint
 * @param {string} intentId
 */
export const rememberCallerIntent = (file, fingerprint, intentId) => {
  const db = openDb(file);
  try {
    db.query(
      `INSERT INTO caller_intents (fingerprint, intent_id) VALUES (?, ?)
       ON CONFLICT(fingerprint) DO UPDATE SET intent_id = excluded.intent_id`,
    ).run(fingerprint, intentId);
  } finally {
    db.close();
  }
};

/**
 * The caller observed a terminal result. The next execute of this action is a new Intent.
 * @param {string} file
 * @param {string} fingerprint
 */
export const forgetCallerIntent = (file, fingerprint) => {
  const db = openDb(file);
  try {
    db.query("DELETE FROM caller_intents WHERE fingerprint = ?").run(fingerprint);
  } finally {
    db.close();
  }
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} fingerprint
 */
const readId = (db, fingerprint) => {
  const row = db
    .query("SELECT intent_id FROM caller_intents WHERE fingerprint = ?")
    .get(fingerprint);
  if (row === null) return undefined;
  return /** @type {{ intent_id: string }} */ (row).intent_id;
};
