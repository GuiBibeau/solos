// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { buildTick } from "../domain/tick-build.js";
import { IntentLookup } from "../ports/intent-lookup.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { recoverTicks } from "./recover-ticks.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const START = 1_700_000_000_000;
const TICK = "01ARZ3NDEKTSV4RRFFQ69G5FAC";

/**
 * @param {number} failures
 * @param {number | undefined} count
 */
const strategy = (failures, count) =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    state: "active",
    owner: "swarm",
    kind: "schedule",
    params: {
      actions: [{ type: "transfer_sol", to: USDC, lamports: "1" }],
      ...(count !== undefined && { count }),
    },
    tickSource: { type: "clock", every: 60_000 },
    createdAt: START,
    expiresAt: null,
    nextDueAt: START,
    bounds: {
      maxNotionalPerTickUsd: "10",
      maxDailySpendUsd: "1000",
      allowedMints: [],
      expiresAt: null,
      maxConsecutiveFailures: failures,
    },
  });

/** @param {import("@solos-sh/actions").Strategy} row @param {"settled" | "failed"} state */
const world = (row, state) =>
  Layer.mergeAll(
    Layer.sync(StrategyIds, () => ({
      now: () => Effect.succeed(START + 60_000),
      ulid: () => Effect.succeed("01ARZ3NDEKTSV4RRFFQ69G5FAB"),
    })),
    clockTickSource,
    memoryStrategyRepository(),
    memoryTickRepository(),
    memoryCapLedger({ boundsFor: () => row.bounds }),
    scriptedObservationReader(() => ({ lamports: "10000000000" })),
    scriptedSpendMeter({ reserveUsd: "1", actualUsd: "1", mint: USDC }),
    Layer.succeed(IntentLookup, {
      lookup: () => Effect.succeed({ state, signature: "sig" }),
    }),
    Layer.succeed(RunMode, { dry: true }),
  );

/** @param {import("@solos-sh/actions").Strategy} row */
const plant = (row) =>
  Effect.gen(function* () {
    yield* (yield* StrategyRepository).save(row);
    const actions = row.kind === "schedule" ? row.params.actions : [];
    yield* (yield* TickRepository).save(
      buildTick({
        tickId: TICK,
        strategyId: row.id,
        dueAt: START,
        startedAt: START,
        finishedAt: null,
        outcome: "in_flight",
        observations: { lamports: "10000000000", instant: START },
        actions,
        intents: [],
      }),
    );
  });

/** @param {import("@solos-sh/actions").Strategy} row @param {"settled" | "failed"} state */
const recoverTwice = (row, state) =>
  Effect.gen(function* () {
    yield* plant(row);
    yield* recoverTicks();
    yield* recoverTicks();
    const ticks = yield* (yield* TickRepository).list({ strategyId: row.id, limit: 10 });
    const loaded = yield* (yield* StrategyRepository).load(row.id);
    return { ticks, state: loaded?.state, nextDueAt: loaded?.nextDueAt };
  }).pipe(Effect.provide(world(row, state)));

describe("recovered tick lifecycle", () => {
  test("a settled count of one is done and a second recovery does not spend", async () => {
    const result = await Effect.runPromise(recoverTwice(strategy(3, 1), "settled"));
    expect(result.ticks).toHaveLength(1);
    expect(result.ticks[0]?.outcome).toBe("executed");
    expect(result.state).toBe("done");
    expect(result.nextDueAt).toBeNull();
  });

  test("a failed intent counts and pauses at the threshold", async () => {
    const result = await Effect.runPromise(recoverTwice(strategy(1, undefined), "failed"));
    expect(result.ticks).toHaveLength(1);
    expect(result.ticks[0]?.outcome).toBe("failed");
    expect(result.state).toBe("paused");
    expect(result.nextDueAt).toBeNull();
  });
});
