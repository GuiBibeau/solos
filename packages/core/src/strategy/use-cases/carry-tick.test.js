// @ts-check
import { describe, expect, test } from "bun:test";
import { CarryParamsSchema, StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { CARRY_OBSERVATIONS } from "../domain/carry-kind.js";
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

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SPOT = "So11111111111111111111111111111111111111112";
const NOW = 1_700_000_000_000;
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const params = CarryParamsSchema.parse({
  market: "SOL-PERP",
  spotMint: SPOT,
  notionalUsd: "100",
  entryHurdleAprPct: "10",
  exitHurdleAprPct: "4",
  lookbackHours: 24,
  expectedHoldHours: 24,
  roundTripCostPct: "0",
});

/** @type {{ fail?: string }} */
const script = {};

const observations = () => {
  /** @type {Record<string, string | number>} */
  const out = {};
  for (const name of CARRY_OBSERVATIONS) out[name] = 0;
  out.currentAprPct = "20";
  out.markPriceUsd = "150";
  out.fundingAt = NOW;
  out.fundingHistory = "[]";
  out.perpSide = "flat";
  out.perpSize = "0";
  out.perpNotionalUsd = "";
  out.onboarded = 1;
  out.equityUsd = "1000";
  out.freeCollateralUsd = "";
  out.spotBalance = "0";
  out.spotDecimals = 9;
  out.quoteBalance = "1000000000";
  out.quoteDecimals = 6;
  out.spotPriceUsd = "150";
  out.quotePriceUsd = "1";
  out.quoteMint = USDC;
  return out;
};

const strategy = StrategySchema.parse({
  schemaVersion: 1,
  id: ID,
  state: "active",
  owner: "swarm",
  kind: "carry",
  params,
  tickSource: { type: "clock", every: 60_000 },
  createdAt: NOW,
  expiresAt: null,
  nextDueAt: NOW,
  bounds: {
    maxNotionalPerTickUsd: "1000",
    maxDailySpendUsd: "5000",
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
      remedy: "fund the spot leg",
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
    scriptedSpendMeter({ reserveUsd: "1", actualUsd: "1", mint: USDC }),
    Layer.sync(TickSubmit, () => ({
      submit: (input) => Effect.succeed({ ...settle(input.action), intentId: input.intentId }),
    })),
    Layer.succeed(RunMode, { dry: false }),
  );

describe("carry tick lifecycle", () => {
  test("a spot-leg failure pauses and the next tick unwinds the naked short", async () => {
    const live = boot();
    script.fail = "swap";
    const first = await Effect.runPromise(run(live));
    expect(first.tick.outcome).toBe("failed");
    expect(first.tick.step).toBe(1);
    expect(first.tick.reason).toContain("step 1");
    expect(first.tick.reason).toContain("swap");
    expect(first.tick.reason).toContain(first.tick.intents[1]?.intentId);
    expect(first.tick.intents.map((row) => row.state)).toEqual(["settled", "failed"]);
    expect(first.status.state).toBe("paused");
    expect(first.tick.state).toMatchObject({ naked: true, spotAmount: "0" });
    script.fail = undefined;
    const second = await Effect.runPromise(run(live));
    expect(second.tick.actions.map((action) => action.type)).toEqual(["close_perp"]);
    expect(second.tick.state).toMatchObject({ reason: "unwind", pauseAfter: true });
    expect(second.tick.note).toContain("unwind");
    expect(second.status.state).toBe("paused");
    expect(second.status.reason).toContain("unwind");
  });
});
