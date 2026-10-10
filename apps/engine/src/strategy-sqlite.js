// @ts-check
import { StrategyRepository } from "@solos/core";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";

/**
 * Strategy table on the Engine database. The adapter owns this migration.
 * @param {import("bun:sqlite").Database} db
 */
export const SqliteStrategyRepository = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY NOT NULL,
    owner TEXT NOT NULL,
    state TEXT NOT NULL,
    body TEXT NOT NULL
  )`);
  return Layer.sync(StrategyRepository, () => ({
    save: (strategy) => Effect.sync(() => write(db, strategy)),
    load: (id) => Effect.sync(() => readOne(db, id)),
    list: (filter) => Effect.sync(() => readMany(db, filter)),
    byState: (state) => Effect.sync(() => readMany(db, { state })),
  }));
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {import("@solos-sh/actions").Strategy} strategy
 */
const write = (db, strategy) => {
  db.query(
    `INSERT INTO strategies (id, owner, state, body) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET owner = excluded.owner, state = excluded.state, body = excluded.body`,
  ).run(strategy.id, strategy.owner, strategy.state, JSON.stringify(strategy));
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} id
 */
const readOne = (db, id) => {
  const row = db.query("SELECT body FROM strategies WHERE id = ?").get(id);
  if (row === null) return undefined;
  return parseBody(/** @type {{ body: string }} */ (row).body);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ state?: string; owner?: string }} filter
 */
const readMany = (db, filter) => {
  const clauses = [];
  const params = [];
  if (filter.state !== undefined) {
    clauses.push("state = ?");
    params.push(filter.state);
  }
  if (filter.owner !== undefined) {
    clauses.push("owner = ?");
    params.push(filter.owner);
  }
  const where = clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`;
  return db
    .query(`SELECT body FROM strategies ${where} ORDER BY id`)
    .all(...params)
    .map((row) => parseBody(/** @type {{ body: string }} */ (row).body));
};

/** @param {string} body */
const parseBody = (body) => StrategySchema.parse(JSON.parse(body));
