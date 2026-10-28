// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { buildTick } from "../domain/tick-build.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickRepository } from "../ports/tick-repository.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { recoverTicks } from "./recover-ticks.js";
import { runTick } from "./run-tick.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const START = 1_700_000_000_000;
const EVERY = 60_000;
const FIRED_AT = START + 120_000;

/** @param {number} now */
const strategy = (now) =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    state: "active",
    owner: "swarm",
    kind: "trigger",
    params: {
      observe: { price: USDC },
      condition: "below",
      priceUsd: "150",
      action: { type: "transfer_sol", to: USDC, lamports: "1" },
      once: false,
      cooldown: 600_000,
    },
    tickSource: { type: "clock", every: EVERY },
    createdAt: START,
    expiresAt: null,
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
      ulid: () => Effect.succeed("01ARZ3NDEKTSV4RRFFQ69G5FA2"),
    })),
    clockTickSource,
    memoryStrategyRepository(),
    memoryTickRepository(),
    memoryCapLedger({ boundsFor: () => strategy(START).bounds }),
    scriptedObservationReader(() => ({ price: "140", priceAt: now() })),
    scriptedSpendMeter({ reserveUsd: "2", actualUsd: "1", mint: USDC }),
    Layer.succeed(RunMode, { dry: true }),
  );

describe("trigger recovery", () => {
  test("a missed tick keeps the trailing reference and the cooldown", async () => {
    const row = strategy(START);
    const prior = buildTick({
      tickId: "01ARZ3NDEKTSV4RRFFQ69G5FA1",
      strategyId: row.id,
      dueAt: START - EVERY,
      startedAt: START - EVERY,
      finishedAt: START - EVERY,
      outcome: "evaluated",
      observations: { price: "180", priceAt: START - EVERY },
      actions: [],
      intents: [],
      state: { bestPriceUsd: "180", firedAt: FIRED_AT },
    });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repository = yield* StrategyRepository;
        const ticks = yield* TickRepository;
        yield* repository.save(row);
        yield* ticks.save(prior);
        yield* recoverTicks();
        const missed = yield* ticks.list({ strategyId: row.id, limit: 5 });
        const loaded = yield* repository.load(row.id);
        if (loaded === undefined) return { missed, followed: undefined };
        const followed = yield* runTick(loaded);
        return { missed, followed };
      }).pipe(Effect.provide(layer(() => START + 2 * EVERY))),
    );
    expect(result.missed[0]?.outcome).toBe("missed");
    expect(result.missed[0]?.state).toEqual({ bestPriceUsd: "180", firedAt: FIRED_AT });
    expect(result.followed?.outcome).toBe("evaluated");
    expect(result.followed?.actions).toEqual([]);
    expect(result.followed?.state).toEqual({ bestPriceUsd: "180", firedAt: FIRED_AT });
  });
});
