// @ts-check
import { StrategyIds, ulidFrom } from "@solos/core";
import { Effect, Layer } from "effect";

/**
 * ULID and clock for the Engine's Registry. Tests pass the same function the ledger uses.
 * @param {() => number} [now]
 */
export const strategyIds = (now = () => Date.now()) =>
  Layer.sync(StrategyIds, () => ({
    now: () => Effect.sync(() => now()),
    ulid: () => Effect.sync(() => ulidFrom(now(), crypto.getRandomValues(new Uint8Array(10)))),
  }));

/** ULID and clock for the Engine's Registry. */
export const StrategyIdsLive = strategyIds();
