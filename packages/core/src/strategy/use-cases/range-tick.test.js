// @ts-check
import { describe, expect, test } from "bun:test";
import { RangeParamsSchema, StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { RANGE_OBSERVATIONS } from "../domain/range-kind.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { performGet } from "./perform-read.js";
import { runTick } from "./run-tick.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const POOL = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const POSITION = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const OPENED = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const NOW = 1_700_000_000_000;
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const params = RangeParamsSchema.parse({
  protocol: "meteora",
  pool: POOL,
  position: POSITION,
  width: 4,
  recenterWhenOutsideFor: 1,
  maxRecentersPerDay: 4,
});

/** @type {{ fail?: string }} */
const script = {};

const observations = () => {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const name of RANGE_OBSERVATIONS) out[name] = 0;
  out.instant = NOW;
  out.activeId = 20;
  out.lowerBinId = 0;
  out.upperBinId = 10;
  out.position = POSITION;
  out.amountA = "1000";
  out.amountB = "2000";
  out.valueUsd = "3";
  out.priceA = "1";
  out.priceB = "1";
  out.tokenAMint = POOL;
  out.tokenBMint = POOL;
  out.poolAt = "2026-10-28T00:00:00.000Z";
  out.priceAPerB = "1";
  return out;
};

const strategy = StrategySchema.parse({
  schemaVersion: 1,
  id: ID,
  state: "active",
  owner: "swarm",
  kind: "range",
  params,
  tickSource: { type: "clock", every: 60_000 },
  createdAt: NOW,
  expiresAt: null,
  nextDueAt: NOW,
  bounds: {
    maxNotionalPerTickUsd: "100",
    maxDailySpendUsd: "1000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  },
});

/** @param {import("@solos-sh/actions").Action} action */
const settle = (action) => {
  if (action.type === script.fail) {
    return {
      intentId: "",
      state: /** @type {const} */ ("failed"),
      reason: "forced",
      remedy: "fix the wallet",
    };
  }
  if (action.type === "remove_liquidity") {
    return {
      intentId: "",
      state: /** @type {const} */ ("settled"),
      signature: "remove",
      details: { amountA: "900", amountB: "1800" },
    };
  }
  if (action.type === "open_position") {
    return {
      intentId: "",
      state: /** @type {const} */ ("settled"),
      signature: "open",
      details: { position: OPENED },
    };
  }
  return { intentId: "", state: /** @type {const} */ ("settled"), signature: action.type };
};

/** @param {import("effect").Layer.Layer<unknown>} live */
const run = (live) =>
  Effect.gen(function* () {
    const repository = yield* StrategyRepository;
    const loaded = (yield* repository.load(ID)) ?? strategy;
    const current = { ...loaded, state: /** @type {const} */ ("active"), nextDueAt: NOW };
    yield* repository.save(current);
    const tick = yield* runTick(current);
    return { tick, status: yield* performGet(ID) };
  }).pipe(Effect.provide(live));

const boot = () =>
  Layer.mergeAll(
    Layer.sync(StrategyIds, () => ({
      now: () => Effect.succeed(NOW),
      ulid: (() => {
        let n = 0;
        return () =>
          Effect.sync(() => {
            n += 1;
            return `01ARZ3NDEKTSV4RRFFQ69G5FA${String(n)}`;
          });
      })(),
    })),
    clockTickSource,
    memoryStrategyRepository(),
    memoryTickRepository(),
    memoryCapLedger({ boundsFor: () => strategy.bounds }),
    scriptedObservationReader(observations),
    scriptedSpendMeter({ reserveUsd: "1", actualUsd: "1", mint: POOL }),
    Layer.sync(TickSubmit, () => ({
      submit: (input) => Effect.succeed({ ...settle(input.action), intentId: input.intentId }),
    })),
    Layer.succeed(RunMode, { dry: false }),
  );

describe("range tick lifecycle", () => {
  test("a failure after remove_liquidity pauses and a resume continues", async () => {
    const live = boot();
    script.fail = "close_position";
    const first = await Effect.runPromise(run(live));
    expect(first.tick.outcome).toBe("failed");
    expect(first.tick.step).toBe(1);
    expect(first.tick.reason).toContain("step 1");
    expect(first.tick.reason).toContain("close_position");
    expect(first.tick.reason).toContain(first.tick.intents[1]?.intentId);
    expect(first.status.state).toBe("paused");
    expect(first.status.lastTick?.intents.map((row) => row.state)).toEqual(["settled", "failed"]);
    expect(first.tick.state).toMatchObject({ recentersToday: 0 });
    script.fail = undefined;
    const second = await Effect.runPromise(run(live));
    expect(second.status.state).toBe("active");
    expect(second.tick.outcome).toBe("executed");
    expect(second.tick.actions[3]).toMatchObject({ amountA: "900", amountB: "1800" });
  });

  test("a failure after open_position keeps the new position and pauses", async () => {
    const live = boot();
    script.fail = "add_liquidity";
    const result = await Effect.runPromise(run(live));
    expect(result.tick.outcome).toBe("failed");
    expect(result.tick.step).toBe(3);
    expect(result.tick.reason).toContain("step 3");
    expect(result.tick.reason).toContain("add_liquidity");
    expect(result.tick.reason).toContain(result.tick.intents[3]?.intentId);
    expect(result.status.state).toBe("paused");
    expect(result.status.params).toMatchObject({ position: OPENED });
    expect(result.tick.state).toMatchObject({ position: OPENED, recentersToday: 0 });
    expect(result.status.lastTick?.intents.map((row) => row.state)).toEqual([
      "settled",
      "settled",
      "settled",
      "failed",
    ]);
  });
});
