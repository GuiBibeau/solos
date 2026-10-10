// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { repositoryConformance } from "@solos/core";
import { Effect } from "effect";
import { SqliteStrategyRepository } from "./strategy-sqlite.js";

describe("sqlite strategy repository", () => {
  test("round-trips a strategy on the engine database", async () => {
    const db = new Database(":memory:");
    try {
      await Effect.runPromise(
        repositoryConformance.pipe(Effect.provide(SqliteStrategyRepository(db))),
      );
      expect(db.query("select count(*) as n from strategies").get()).toEqual({ n: 1 });
    } finally {
      db.close();
    }
  });
});
