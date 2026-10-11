// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CapLedger,
  clockTickSource,
  memoryCapLedger,
  memoryStrategyRepository,
  memoryTickRepository,
  StrategyIds,
  StrategyRepository,
  scriptedSpendMeter,
  TickRepository,
} from "@solos/core/strategy";
import { SolanaRpc } from "@solos/solana";
import { StrategySchema, WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer, ManagedRuntime } from "effect";
import { claimIntent, openIntents, recordSigned, settleIntent } from "./intents.js";
import { bootTicks } from "./tick-boot.js";
import { tickIntentId } from "./tick-clock-one.js";

const STRATEGY = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TICK = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const INTENT = tickIntentId(STRATEGY, TICK, 0);
const START = 1_700_000_000_000;
const EVERY = 60_000;
const SIG = "sig";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const QUOTE = { reserveUsd: "2", actualUsd: "1", mint: WSOL_MINT, solPriceUsd: "100" };
const ACTION = {
  type: /** @type {const} */ ("swap"),
  inputMint: WSOL_MINT,
  outputMint: USDC,
  amount: "10000000",
  maxSlippageBps: 50,
};

/** @typedef {{ kind: "settle" | "reserve" }} Note */
/** @typedef {{ count?: number; failures?: number }} Shape */

/**
 * @param {Shape} shape
 */
const strategy = (shape) =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: STRATEGY,
    state: "active",
    owner: "swarm",
    kind: "schedule",
    params: { actions: [ACTION], ...(shape.count !== undefined && { count: shape.count }) },
    tickSource: { type: "clock", every: EVERY },
    createdAt: START,
    expiresAt: null,
    nextDueAt: START + 10 * EVERY,
    bounds: {
      maxNotionalPerTickUsd: "100",
      maxDailySpendUsd: "1000",
      allowedMints: [],
      expiresAt: null,
      maxConsecutiveFailures: shape.failures ?? 3,
    },
  });

const openTick = () => ({
  tickId: TICK,
  strategyId: STRATEGY,
  dueAt: START,
  startedAt: START,
  finishedAt: null,
  outcome: /** @type {const} */ ("in_flight"),
  observations: {},
  actions: [ACTION],
  intents: [
    {
      intentId: INTENT,
      state: /** @type {const} */ ("in_flight"),
      signature: SIG,
      notionalUsd: QUOTE.reserveUsd,
      mint: QUOTE.mint,
    },
  ],
});

/** @param {import("bun:sqlite").Database} db @param {"confirmed" | "failed"} status */
const plantSettled = (db, status) => {
  claimIntent(db, INTENT, { action: ACTION, simulated: true });
  recordSigned(db, INTENT, { signature: SIG, lastValidBlockHeight: 100n });
  settleIntent(db, INTENT, {
    action: ACTION,
    status,
    signature: SIG,
    executedAt: START,
    simulated: true,
    error: status === "confirmed" ? null : "execution failed",
  });
};

/** @param {import("bun:sqlite").Database} db */
const plantSigned = (db) => {
  claimIntent(db, INTENT, { action: ACTION, simulated: true });
  recordSigned(db, INTENT, { signature: SIG, lastValidBlockHeight: 10n });
};

/** @param {{ height: () => bigint; status: () => unknown; transaction: () => unknown }} script */
const rpcLayer = (script) =>
  Layer.succeed(SolanaRpc, {
    url: "http://127.0.0.1:1",
    rpc: /** @type {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} */ ({
      getSignatureStatuses: () => ({ send: async () => ({ value: [script.status()] }) }),
      getBlockHeight: () => ({ send: async () => script.height() }),
      getTransaction: () => ({ send: async () => script.transaction() }),
    }),
    rpcSubscriptions:
      /** @type {import("@solana/kit").RpcSubscriptions<import("@solana/kit").SolanaRpcSubscriptionsApi>} */ ({}),
  });

/** @param {Note[]} notes @param {Shape} shape */
const ledgerLayer = (notes, shape) =>
  Layer.effect(
    CapLedger,
    Effect.gen(function* () {
      const inner = yield* CapLedger;
      return {
        ...inner,
        reserve: (request) =>
          Effect.zipRight(
            Effect.sync(() => {
              notes.push({ kind: "reserve" });
            }),
            inner.reserve(request),
          ),
        settle: (id, usd) =>
          Effect.zipRight(
            Effect.sync(() => {
              notes.push({ kind: "settle" });
            }),
            inner.settle(id, usd),
          ),
      };
    }),
  ).pipe(Layer.provide(memoryCapLedger({ boundsFor: () => strategy(shape).bounds })));

/** @param {Shape} shape */
const world = (shape) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "tick-life-"));
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  /** @type {Note[]} */
  const notes = [];
  const script = {
    height: () => 10n,
    status: () => /** @type {unknown} */ ({ confirmationStatus: "confirmed", err: null }),
    transaction: () => /** @type {unknown} */ ({ meta: { fee: 105_000n } }),
  };
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.sync(StrategyIds, () => ({
        now: () => Effect.sync(() => START),
        ulid: () => Effect.succeed(TICK),
      })),
      clockTickSource,
      memoryStrategyRepository(),
      memoryTickRepository(),
      ledgerLayer(notes, shape),
      scriptedSpendMeter(QUOTE),
      rpcLayer(script),
    ),
  );
  return { dataDir, db, notes, script, runtime, shape };
};

/** @param {ReturnType<typeof world>} env */
const plant = (env) =>
  env.runtime.runPromise(
    Effect.gen(function* () {
      yield* (yield* StrategyRepository).save(strategy(env.shape));
      yield* (yield* TickRepository).save(openTick());
      yield* (yield* CapLedger).reserve({
        strategyId: STRATEGY,
        tickId: TICK,
        intentId: INTENT,
        notionalUsd: QUOTE.reserveUsd,
        mint: QUOTE.mint,
      });
    }),
  );

/** @param {ReturnType<typeof world>} env */
const loaded = (env) =>
  env.runtime.runPromise(
    Effect.gen(function* () {
      const row = yield* (yield* StrategyRepository).load(STRATEGY);
      const ticks = yield* (yield* TickRepository).list({ strategyId: STRATEGY, limit: 5 });
      return { state: row?.state, nextDueAt: row?.nextDueAt, ticks: ticks.length };
    }),
  );

/** @type {ReturnType<typeof world> | undefined} */
let env;

afterEach(async () => {
  if (env === undefined) return;
  await env.runtime.dispose();
  env.db.close();
  rmSync(env.dataDir, { recursive: true, force: true });
  env = undefined;
});

/** @param {NonNullable<typeof env>} current */
const drive = (current) =>
  bootTicks(current.runtime, true, {
    dataDir: current.dataDir,
    minIntervalMs: EVERY,
    tickDrive: "manual",
  });

describe("in-flight tick lifecycle on the clock", () => {
  test("a count of one closed by the loop is done and a second pass does not hold", async () => {
    env = world({ count: 1 });
    const booted = await drive(env);
    plantSettled(env.db, "confirmed");
    await plant(env);
    const planted = env.notes.length;
    await booted.runDue();
    expect(await loaded(env)).toEqual({ state: "done", nextDueAt: null, ticks: 1 });
    const closed = env.notes.length;
    expect(closed).toBeGreaterThan(planted);
    await booted.runDue();
    expect(env.notes).toHaveLength(closed);
    expect((await loaded(env)).ticks).toBe(1);
    await booted.stop();
  });

  test("a failed tick closed by the loop pauses at the failure limit", async () => {
    env = world({ failures: 1 });
    const booted = await drive(env);
    plantSettled(env.db, "failed");
    await plant(env);
    await booted.runDue();
    expect(await loaded(env)).toEqual({ state: "paused", nextDueAt: null, ticks: 1 });
    await booted.stop();
  });

  test("an expired blockhash closed by the loop pauses at the failure limit", async () => {
    env = world({ failures: 1 });
    env.script.status = () => null;
    env.script.height = () => 50n;
    env.script.transaction = () => null;
    const booted = await drive(env);
    plantSigned(env.db);
    await plant(env);
    await booted.runDue();
    expect(await loaded(env)).toEqual({ state: "paused", nextDueAt: null, ticks: 1 });
    await booted.stop();
  });
});
