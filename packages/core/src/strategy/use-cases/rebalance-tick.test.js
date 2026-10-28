// @ts-check
import { describe, expect, test } from "bun:test";
import { RebalanceParamsSchema, StrategySchema, USDC_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { rebalanceObservations } from "../domain/rebalance-kind.js";
import { RunMode } from "../ports/run-mode.js";
import { StrategyIds } from "../ports/strategy-ids.js";
import { StrategyRepository } from "../ports/strategy-repository.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { clockTickSource } from "./clock-source.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { memoryStrategyRepository } from "./memory-repository.js";
import { memoryTickRepository } from "./memory-ticks.js";
import { runTick } from "./run-tick.js";
import { scriptedObservationReader } from "./scripted-reader.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = USDC_MINT;
const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const NOW = 1_700_000_000_000;

const params = RebalanceParamsSchema.parse({
  targets: { [JUP]: "0.5", [USDT]: "0.2", [USDC]: "0.3" },
  bandBps: 100,
  minTradeUsd: "1",
});

/** @type {Record<string, string>} */
const book = { [JUP]: "500000000", [USDT]: "0", [USDC]: "100000000" };
const quote = { at: NOW, usdt: "1" };

/** @param {string} mint */
const priceOf = (mint) => {
  if (mint === JUP) return "2";
  if (mint === USDT) return quote.usdt;
  return "1";
};

const observations = () => {
  /** @type {Record<string, string | number>} */
  const out = { priceAt: quote.at };
  for (const mint of [JUP, USDT, USDC]) {
    out[`balance:${mint}`] = book[mint] ?? "0";
    out[`decimals:${mint}`] = 6;
    out[`price:${mint}`] = priceOf(mint);
    out[`priceAt:${mint}`] = quote.at;
  }
  return out;
};

const strategy = StrategySchema.parse({
  schemaVersion: 1,
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  state: "active",
  owner: "swarm",
  kind: "rebalance",
  params,
  tickSource: { type: "clock", every: 60_000 },
  createdAt: NOW,
  expiresAt: null,
  nextDueAt: NOW,
  bounds: {
    maxNotionalPerTickUsd: "300",
    maxDailySpendUsd: "5000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
  },
});

const layer = Layer.mergeAll(
  Layer.sync(StrategyIds, () => ({
    now: () => Effect.succeed(NOW),
    ulid: (() => {
      let n = 0;
      return () =>
        Effect.sync(() => {
          n += 1;
          return `01ARZ3NDEKTSV4RRFFQ69G5FA${n}`;
        });
    })(),
  })),
  clockTickSource,
  memoryStrategyRepository(),
  memoryTickRepository(),
  memoryCapLedger({ boundsFor: () => strategy.bounds }),
  scriptedObservationReader(observations),
  scriptedSpendMeter((action) => ({
    reserveUsd: action.type === "swap" && action.outputMint === USDT ? "200" : "250",
    actualUsd: action.type === "swap" && action.outputMint === USDT ? "200" : "250",
    mint: action.type === "swap" ? action.inputMint : USDC,
  })),
  Layer.sync(TickSubmit, () => ({
    submit: (input) =>
      Effect.succeed({ intentId: input.intentId, state: "settled", signature: "sig" }),
  })),
  Layer.succeed(RunMode, { dry: false }),
);

const tick = () =>
  Effect.gen(function* () {
    yield* (yield* StrategyRepository).save(strategy);
    return yield* runTick(strategy);
  }).pipe(Effect.provide(layer));

describe("rebalance ticks and the per-tick cap", () => {
  test("the largest trade settles and a later trade records skipped_bounds", async () => {
    book[JUP] = "500000000";
    book[USDT] = "0";
    book[USDC] = "100000000";
    quote.at = NOW;
    quote.usdt = "1";
    const names = rebalanceObservations(params);
    expect(names).toContain(`price:${JUP}`);
    expect(names).toContain("priceAt");
    const first = await Effect.runPromise(tick());
    expect(first.actions.map((action) => action.type === "swap" && action.inputMint)).toEqual([
      JUP,
      USDC,
    ]);
    expect(first.outcome).toBe("skipped_bounds");
    expect(first.step).toBe(1);
    expect(first.intents).toHaveLength(1);
    expect(first.intents[0]?.state).toBe("settled");
    expect(first.reason).toContain("per-tick cap");
    expect(first.state?.mints?.[JUP]?.target).toBe("0.5");
    expect(first.state?.mints?.[JUP]?.driftBps).toBeGreaterThan(100);
    book[JUP] = "275000000";
    book[USDC] = "550000000";
    const second = await Effect.runPromise(tick());
    expect(second.outcome).toBe("executed");
    expect(second.actions).toHaveLength(1);
    expect(second.actions[0]).toMatchObject({
      inputMint: USDC,
      outputMint: USDT,
      amount: "220000000",
    });
    expect(second.intents).toHaveLength(1);
    expect(second.intents[0]?.state).toBe("settled");
  });

  test("a missing price fails the tick and a stale quote skips it", async () => {
    book[JUP] = "500000000";
    book[USDT] = "0";
    book[USDC] = "100000000";
    quote.at = NOW - 500_000;
    quote.usdt = "";
    const failed = await Effect.runPromise(tick());
    expect(failed.outcome).toBe("failed");
    expect(failed.reason).toBe(`missing price for ${USDT}`);
    expect(failed.actions).toEqual([]);
    expect(failed.intents).toHaveLength(0);
    quote.usdt = "1";
    const skipped = await Effect.runPromise(tick());
    expect(skipped.outcome).toBe("skipped_observation");
    expect(skipped.reason).toContain("staleness");
    expect(skipped.actions).toEqual([]);
  });
});
