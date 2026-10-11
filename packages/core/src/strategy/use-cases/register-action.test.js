// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { PriceFeed } from "../../market/index.js";
import { UnsupportedStrategyAction } from "../domain/errors.js";
import { ulidFrom } from "../domain/ulid.js";
import { CadenceFloor } from "../ports/cadence-floor.js";
import { EngineAllowlist } from "../ports/engine-allowlist.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRegistry } from "../ports/strategy-registry.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { InProcessStrategyRegistry } from "./registry-live.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const bounds = {
  maxNotionalPerTickUsd: "1",
  maxDailySpendUsd: "2",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
};

const lend = {
  type: "lend",
  protocol: "kamino",
  market: USDC,
  mint: USDC,
  amount: "1000000",
};

const draft = (action) => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [action] },
  tickSource: { type: "clock", every: 60_000 },
  bounds,
});

const layer = () => {
  let n = 0;
  return InProcessStrategyRegistry.pipe(
    Layer.provide(
      Layer.mergeAll(
        memoryStrategyRepository(),
        memoryTickRepository(),
        Layer.succeed(EngineAllowlist, { mints: [] }),
        Layer.succeed(CadenceFloor, { minIntervalMs: 10_000 }),
        Layer.succeed(PriceFeed, {
          source: "test",
          getPrice: (mint) => Effect.succeed({ mint, priceUsd: "1", source: "test", at: 1 }),
        }),
        Layer.sync(StrategyIds, () => ({
          now: () => Effect.succeed(1_700_000_000_000),
          ulid: () =>
            Effect.sync(() => {
              n += 1;
              const random = new Uint8Array(10);
              random[9] = n;
              return ulidFrom(1_700_000_000_000, random);
            }),
        })),
      ),
    ),
  );
};

describe("strategy registration actions", () => {
  test("a lend schedule is refused and nothing is stored", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* StrategyRegistry;
        const refused = yield* registry.register(draft(lend)).pipe(Effect.either);
        const stored = yield* registry.list({});
        return { refused, stored: stored.strategies.length };
      }).pipe(Effect.provide(layer())),
    );
    expect(result.refused._tag).toBe("Left");
    if (result.refused._tag === "Left") {
      expect(result.refused.left).toBeInstanceOf(UnsupportedStrategyAction);
      expect(result.refused.left.remedy).toContain("transfer_sol");
      expect(result.refused.left.remedy).toContain("swap");
    }
    expect(result.stored).toBe(0);
  });

  test("a transfer_sol schedule still registers", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const registry = yield* StrategyRegistry;
        return yield* registry.register(draft({ type: "transfer_sol", to: USDC, lamports: "1" }));
      }).pipe(Effect.provide(layer())),
    );
    expect(result.state).toBe("active");
  });
});
