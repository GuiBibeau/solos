// @ts-check
import { EngineAllowlist, InProcessStrategyRegistry } from "@solos/core";
import { Layer } from "effect";
import { StrategyIdsLive } from "./strategy-ids.js";
import { SqliteStrategyRepository } from "./strategy-sqlite.js";

/**
 * In-process Registry over the Engine database.
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
      ),
    ),
  );
