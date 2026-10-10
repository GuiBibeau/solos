// @ts-check
import { TickRepository, TickSchema } from "@solos/core/strategy";
import { Effect, Layer } from "effect";

/**
 * Append-only Tick table on the Engine database. `list` is the complete record.
 * `recent` is the bounded window.
 * @param {import("bun:sqlite").Database} db
 * @param {number} [window]
 */
export const SqliteTickRepository = (db, window = 50) => {
  db.exec(`CREATE TABLE IF NOT EXISTS ticks (
    tick_id TEXT PRIMARY KEY NOT NULL,
    strategy_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    outcome TEXT NOT NULL,
    body TEXT NOT NULL
  )`);
  return Layer.sync(TickRepository, () => ({
    save: (tick) => Effect.sync(() => writeTick(db, tick)),
    list: (query) => Effect.sync(() => readTicks(db, query, query.limit ?? 20)),
    recent: (strategyId) => Effect.sync(() => readTicks(db, { strategyId }, window)),
  }));
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {import("@solos/core/strategy").TickSchema extends infer _ ? import("zod").infer<typeof TickSchema> : never} tick
 */
const writeTick = (db, tick) => {
  db.query(
    `INSERT INTO ticks (tick_id, strategy_id, started_at, outcome, body) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tick_id) DO UPDATE SET
       strategy_id = excluded.strategy_id,
       started_at = excluded.started_at,
       outcome = excluded.outcome,
       body = excluded.body`,
  ).run(tick.tickId, tick.strategyId, tick.startedAt, tick.outcome, JSON.stringify(tick));
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ strategyId: string; outcome?: string }} query
 * @param {number} limit
 */
const readTicks = (db, query, limit) => {
  const outcome = query.outcome === undefined ? "" : "AND outcome = ?";
  const params = query.outcome === undefined ? [query.strategyId, limit] : [query.strategyId, query.outcome, limit];
  return db
    .query(
      `SELECT body FROM ticks WHERE strategy_id = ? ${outcome} ORDER BY started_at DESC, rowid DESC LIMIT ?`,
    )
    .all(...params)
    .map((row) => TickSchema.parse(JSON.parse(/** @type {{ body: string }} */ (row).body)));
};
