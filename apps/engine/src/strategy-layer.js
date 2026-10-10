// @ts-check
import { EngineAllowlist, InProcessStrategyRegistry } from "@solos/core";
import { Layer } from "effect";
import { sqliteCapLedger } from "./cap-ledger.js";
import { StrategyIdsLive } from "./strategy-ids.js";
import { SqliteStrategyRepository, strategyBounds } from "./strategy-sqlite.js";

/**
 * In-process Registry and the durable cap ledger over the Engine database.
 * `allowedMints` is the Engine allowlist the ledger already expects. Empty means any mint.
 * @param {import("bun:sqlite").Database} db
 * @param {ReadonlyArray<string>} allowedMints
 */
export const strategyLayer = (db, allowedMints) =>
  InProcessStrategyRegistry.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        SqliteStrategyRepository(db),
        Layer.succeed(EngineAllowlist, { mints: allowedMints }),
        StrategyIdsLive,
        sqliteCapLedger(db, {
          boundsFor: (id) => strategyBounds(db, id),
          engineMints: () => allowedMints,
        }),
      ),
    ),
  );
