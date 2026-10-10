// @ts-check
import { StrategyIds, ulidFrom } from "@solos/core";
import { Effect, Layer } from "effect";

/** ULID and clock for the Engine's Registry. */
export const StrategyIdsLive = Layer.sync(StrategyIds, () => ({
  now: () => Effect.sync(() => Date.now()),
  ulid: () => Effect.sync(() => ulidFrom(Date.now(), crypto.getRandomValues(new Uint8Array(10)))),
}));
