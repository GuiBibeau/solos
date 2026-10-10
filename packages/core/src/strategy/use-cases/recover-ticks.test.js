// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { recoverTicks } from "./recover-ticks.js";
import { runDueTicks } from "./run-due.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const START = 1_700_000_000_000;

/** @param {number} now @param {number | null} expiresAt */
const strategy = (now, expiresAt) =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    state: "active",
    owner: "swarm",
    kind: "schedule",
    params: { actions: [{ type: "transfer_sol", to: USDC, lamports: "1" }] },
    tickSource: { type: "clock", every: 60_000 },
    createdAt: START,
    expiresAt,
    nextDueAt: now,
    bounds: {
      maxNotionalPerTickUsd: "10",
      maxDailySpendUsd: "1000",
      allowedMints: [],
      expiresAt: null,
      maxConsecutiveFailures: 3,
    },
  });

/** @param {() => number} now */
const layer = (now) =>
  Layer.mergeAll(
    Layer.sync(StrategyIds, () => ({
      now: () => Effect.sync(now),
      ulid: () => Effect.succeed("01ARZ3NDEKTSV4RRFFQ69G5FAB"),
    })),
    clockTickSource,
    memoryStrategyRepository(),
    memoryTickRepository(),
    memoryCapLedger({ boundsFor: () => strategy(0, null).bounds }),
    scriptedObservationReader(() => ({ lamports: "10000000000" })),
    scriptedSpendMeter({ reserveUsd: "1", actualUsd: "1", mint: USDC }),
    Layer.succeed(RunMode, { dry: true }),
  );

describe("tick recovery", () => {
  test("a restart after two intervals records one missed Tick and reschedules from now", async () => {
    const now = START + 120_000;
    const row = strategy(START, null);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(row);
        yield* recoverTicks();
        const ticks = yield* (yield* TickRepository).list({ strategyId: row.id, limit: 10 });
        const loaded = yield* (yield* StrategyRepository).load(row.id);
        return { ticks, nextDueAt: loaded?.nextDueAt };
      }).pipe(Effect.provide(layer(() => now))),
    );
    expect(result.ticks).toHaveLength(1);
    expect(result.ticks[0]?.outcome).toBe("missed");
    expect(result.nextDueAt).toBe(now + 60_000);
  });

  test("a due instant at or after expiresAt expires the Strategy and records no Tick", async () => {
    const row = strategy(START, START);
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* (yield* StrategyRepository).save(row);
        yield* runDueTicks();
        const ticks = yield* (yield* TickRepository).list({ strategyId: row.id, limit: 10 });
        const loaded = yield* (yield* StrategyRepository).load(row.id);
        return { ticks, state: loaded?.state };
      }).pipe(Effect.provide(layer(() => START))),
    );
    expect(result.ticks).toHaveLength(0);
    expect(result.state).toBe("expired");
  });
});
