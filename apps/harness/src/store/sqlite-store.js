// @ts-check
import { Database } from "bun:sqlite";
import { Store } from "@solos/core";
import { Effect, Layer, Option } from "effect";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS kv (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, key)
  )
`;

/** @param {Database} db */
const statements = (db) => ({
  get: db.query("SELECT value FROM kv WHERE namespace = ? AND key = ?"),
  set: db.query(
    "INSERT INTO kv (namespace, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(namespace, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ),
  list: db.query("SELECT key, value FROM kv WHERE namespace = ? ORDER BY key"),
  remove: db.query("DELETE FROM kv WHERE namespace = ? AND key = ?"),
});

/**
 * Durable `Store` on bun:sqlite. `:memory:` works for tests. The file's directory must exist.
 * @param {string} path
 */
export const StoreSqlite = (path) =>
  Layer.scoped(
    Store,
    Effect.acquireRelease(
      Effect.sync(() => {
        const db = new Database(path, { create: true });
        db.exec(SCHEMA);
        return db;
      }),
      (db) => Effect.sync(() => db.close()),
    ).pipe(
      Effect.map((db) => {
        const q = statements(db);
        return {
          get: (namespace, key) =>
            Effect.sync(() => {
              const row = /** @type {{ value: string } | null} */ (q.get.get(namespace, key));
              return row === null ? Option.none() : Option.some(JSON.parse(row.value));
            }),
          set: (namespace, key, value) =>
            Effect.sync(() => void q.set.run(namespace, key, JSON.stringify(value), Date.now())),
          list: (namespace) =>
            Effect.sync(() =>
              /** @type {Array<{ key: string; value: string }>} */ (q.list.all(namespace)).map(
                (row) => ({
                  key: row.key,
                  value: JSON.parse(row.value),
                }),
              ),
            ),
          remove: (namespace, key) => Effect.sync(() => void q.remove.run(namespace, key)),
        };
      }),
    ),
  );
