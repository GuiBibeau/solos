// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { PriceFeed } from "../../market/index.js";
import { ulidFrom } from "../domain/ulid.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { registryConformance, repositoryConformance } from "./conformance.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { InProcessStrategyRegistry } from "./registry-live.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ids = () => {
  let n = 0;
  return Layer.sync(StrategyIds, () => ({
    now: () => Effect.sync(() => 1_700_000_000_000),
    ulid: () =>
      Effect.sync(() => {
        n += 1;
        const random = new Uint8Array(10);
        random[9] = n;
        return ulidFrom(1_700_000_000_000, random);
      }),
  }));
};

const prices = Layer.succeed(PriceFeed, {
  source: "test",
  getPrice: (mint) => Effect.succeed({ mint, priceUsd: "150", source: "test", at: 1 }),
});

const registryLayer = () =>
  InProcessStrategyRegistry.pipe(
    Layer.provide(
      Layer.mergeAll(
        memoryStrategyRepository(),
        Layer.succeed(EngineAllowlist, { mints: [USDC] }),
        ids(),
        prices,
      ),
    ),
  );

describe("strategy registry conformance", () => {
  test("the in-memory repository round-trips a strategy", async () => {
    await Effect.runPromise(repositoryConformance.pipe(Effect.provide(memoryStrategyRepository())));
    expect(true).toBe(true);
  });

  test("the in-process registry allows the state table and refuses a widening mint", async () => {
    await Effect.runPromise(registryConformance.pipe(Effect.provide(registryLayer())));
    expect(true).toBe(true);
  });
});
