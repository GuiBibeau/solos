// @ts-check
import { describe, expect, test } from "bun:test";
import { StrategySchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { runTick } from "./run-tick.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const NOW = 1_700_000_000_000;
const ACTION = { type: "transfer_sol", to: USDC, lamports: "1" };

const strategy = StrategySchema.parse({
  schemaVersion: 1,
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  state: "active",
  owner: "swarm",
  kind: "schedule",
  params: { actions: [ACTION, ACTION] },
  tickSource: { type: "clock", every: 60_000 },
  createdAt: NOW,
  expiresAt: null,
  nextDueAt: NOW,
  bounds: {
    maxNotionalPerTickUsd: "10",
    maxDailySpendUsd: "1000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  },
});

const ids = Layer.sync(StrategyIds, () => ({
  now: () => Effect.succeed(NOW),
  ulid: () => Effect.succeed("01ARZ3NDEKTSV4RRFFQ69G5FAV"),
}));

const submit = Layer.sync(TickSubmit, () => ({
  submit: (input) => Effect.succeed({ intentId: input.intentId, state: "settled", signature: "sig" }),
}));

const layer = Layer.mergeAll(
  ids,
  clockTickSource,
  memoryStrategyRepository(),
  memoryTickRepository(),
  memoryCapLedger({ boundsFor: () => strategy.bounds }),
  scriptedObservationReader(() => ({ lamports: "10000000000" })),
  scriptedSpendMeter({ reserveUsd: "6", actualUsd: "6", mint: USDC }),
  submit,
  Layer.succeed(RunMode, { dry: false }),
);

describe("runTick bounds", () => {
  test("two Actions that each fit a tick cap record skipped_bounds when they exceed it together", async () => {
    const tick = await Effect.runPromise(runTick(strategy).pipe(Effect.provide(layer)));
    expect(tick.outcome).toBe("skipped_bounds");
    expect(tick.step).toBe(1);
    expect(tick.intents).toHaveLength(1);
    expect(tick.intents[0]?.state).toBe("settled");
    expect(tick.reason).toContain("per-tick cap");
  });
});
