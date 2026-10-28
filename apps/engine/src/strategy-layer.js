// @ts-check
import { EngineAllowlist } from "@solos/core";
import {
  CadenceFloor,
  InProcessStrategyRegistry,
  RunMode,
  clockTickSource,
  observationStaleness,
  scriptedObservationReader,
  scriptedSpendMeter,
} from "@solos/core/strategy";
import { MintDecimalsLive } from "@solos/solana/market/mint-decimals";
import { Layer } from "effect";
import { sqliteCapLedger } from "./cap-ledger.js";
import { strategyIds } from "./strategy-ids.js";
import { SqliteStrategyRepository, strategyBounds } from "./strategy-sqlite.js";
import { engineIntentLookup } from "./tick-lookup.js";
import { liveObservationReader } from "./tick-observe.js";
import { liveSpendMeter } from "./tick-spend.js";
import { SqliteTickRepository } from "./tick-sqlite.js";
import { engineTickSubmit } from "./tick-submit.js";

/**
 * @typedef {{
 *   readonly allowedMints: ReadonlyArray<string>;
 *   readonly minIntervalMs: number;
 *   readonly tickWindow: number;
 *   readonly dry: boolean;
 *   readonly stalenessIntervals?: number;
 *   readonly stalenessMs?: number;
 *   readonly now: () => number;
 *   readonly observations?: () => Readonly<Record<string, string | number>>;
 *   readonly quote?:
 *     | {
 *         readonly reserveUsd: string;
 *         readonly actualUsd: string;
 *         readonly mint: string;
 *         readonly solPriceUsd?: string;
 *       }
 *     | ((
 *         action: import("@solos-sh/actions").Action,
 *       ) => {
 *         readonly reserveUsd: string;
 *         readonly actualUsd: string;
 *         readonly mint: string;
 *         readonly solPriceUsd?: string;
 *       });
 *   readonly swapFixture?: import("./swap-fixture.js").SwapFixtureConfig;
 * }} StrategyLayerOptions
 */

/**
 * In-process Registry, durable cap ledger, clock, and Tick record.
 * Empty `allowedMints` means any mint.
 * @param {import("bun:sqlite").Database} db
 * @param {StrategyLayerOptions} options
 */
export const strategyLayer = (db, options) =>
  InProcessStrategyRegistry.pipe(Layer.provideMerge(sharedLayer(db, options)));

/**
 * @param {import("bun:sqlite").Database} db
 * @param {StrategyLayerOptions} options
 */
const sharedLayer = (db, options) => {
  const repository = SqliteStrategyRepository(db);
  return Layer.mergeAll(
    repository,
    SqliteTickRepository(db, options.tickWindow),
    Layer.succeed(EngineAllowlist, { mints: options.allowedMints }),
    strategyIds(options.now),
    Layer.succeed(CadenceFloor, { minIntervalMs: options.minIntervalMs }),
    Layer.succeed(RunMode, { dry: options.dry }),
    clockTickSource,
    observationStaleness({
      ...(options.stalenessIntervals !== undefined && { intervals: options.stalenessIntervals }),
      ...(options.stalenessMs !== undefined && { absoluteMs: options.stalenessMs }),
    }),
    sqliteCapLedger(db, {
      boundsFor: (id) => strategyBounds(db, id),
      now: options.now,
      engineMints: () => options.allowedMints,
    }),
    options.observations === undefined
      ? liveObservationReader.pipe(Layer.provide(repository))
      : scriptedObservationReader(options.observations),
    options.quote === undefined ? liveSpendMeter : scriptedSpendMeter(options.quote),
    engineTickSubmit(db, options.swapFixture),
    engineIntentLookup(db),
  ).pipe(Layer.provideMerge(MintDecimalsLive()));
};
