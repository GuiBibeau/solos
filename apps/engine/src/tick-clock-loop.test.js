// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CapLedger,
  StrategyIds,
  StrategyRepository,
  TickRepository,
  addDecimal,
  clockTickSource,
  memoryCapLedger,
  memoryStrategyRepository,
  memoryTickRepository,
  scriptedSpendMeter,
  usdForLamports,
} from "@solos/core/strategy";
import { SolanaRpc } from "@solos/solana";
import { StrategySchema, WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer, ManagedRuntime } from "effect";
import { claimIntent, openIntents, readIntent, recordSigned, settleIntent } from "./intents.js";
import { bootTicks } from "./tick-boot.js";
import { reconcileOpenTicks } from "./tick-clock-loop.js";
import { tickIntentId } from "./tick-clock-one.js";

const STRATEGY = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const TICK = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const INTENT = tickIntentId(STRATEGY, TICK, 0);
const START = 1_700_000_000_000;
const EVERY = 60_000;
const SIG = "sig";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const FEE = "105000";
const QUOTE = {
  reserveUsd: "2",
  actualUsd: "1",
  mint: WSOL_MINT,
  solPriceUsd: "100",
};
const BOUNDS = {
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "1000",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 3,
};
const ACTION = {
  type: /** @type {const} */ ("swap"),
  inputMint: WSOL_MINT,
  outputMint: USDC,
  amount: "10000000",
  maxSlippageBps: 50,
};

/** @typedef {{ kind: "settle"; usd: string } | { kind: "release" }} Note */

const spendUsd = () => addDecimal(QUOTE.actualUsd, usdForLamports(FEE, QUOTE.solPriceUsd) ?? "0");

const strategy = () =>
  StrategySchema.parse({
    schemaVersion: 1,
    id: STRATEGY,
    state: "active",
    owner: "swarm",
    kind: "schedule",
    params: { actions: [ACTION] },
    tickSource: { type: "clock", every: EVERY },
    createdAt: START,
    expiresAt: null,
    nextDueAt: START + 10 * EVERY,
    bounds: BOUNDS,
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

/** @param {{ height: () => bigint; status: () => unknown; transaction: () => unknown; feeCalls: number }} script */
const rpcLayer = (script) =>
  Layer.succeed(SolanaRpc, {
    url: "http://127.0.0.1:1",
    rpc: /** @type {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} */ ({
      getSignatureStatuses: () => ({ send: async () => ({ value: [script.status()] }) }),
      getBlockHeight: () => ({ send: async () => script.height() }),
      getTransaction: () => ({
        send: async () => {
          script.feeCalls += 1;
          return script.transaction();
        },
      }),
    }),
    rpcSubscriptions:
      /** @type {import("@solana/kit").RpcSubscriptions<import("@solana/kit").SolanaRpcSubscriptionsApi>} */ ({}),
  });

/** @param {Note[]} notes */
const ledgerLayer = (notes) =>
  Layer.effect(
    CapLedger,
    Effect.gen(function* () {
      const inner = yield* CapLedger;
      return {
        ...inner,
        settle: (id, usd) =>
          Effect.zipRight(
            Effect.sync(() => {
              notes.push({ kind: "settle", usd });
            }),
            inner.settle(id, usd),
          ),
        release: (id) =>
          Effect.zipRight(
            Effect.sync(() => {
              notes.push({ kind: "release" });
            }),
            inner.release(id),
          ),
      };
    }),
  ).pipe(Layer.provide(memoryCapLedger({ boundsFor: () => BOUNDS })));

const world = () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), "tick-clock-"));
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  /** @type {Note[]} */
  const notes = [];
  const clock = { now: START };
  const script = {
    feeCalls: 0,
    height: () => 10n,
    status: () => /** @type {unknown} */ ({ confirmationStatus: "confirmed", err: null }),
    transaction: () => /** @type {unknown} */ ({ meta: { fee: 105_000n } }),
  };
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.sync(StrategyIds, () => ({
        now: () => Effect.sync(() => clock.now),
        ulid: () => Effect.succeed(TICK),
      })),
      clockTickSource,
      memoryStrategyRepository(),
      memoryTickRepository(),
      ledgerLayer(notes),
      scriptedSpendMeter(QUOTE),
      rpcLayer(script),
    ),
  );
  return { dataDir, db, notes, clock, script, runtime };
};

/** @param {ReturnType<typeof world>} env */
const plantTick = (env) =>
  env.runtime.runPromise(
    Effect.gen(function* () {
      yield* (yield* StrategyRepository).save(strategy());
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
const tick = async (env) => {
  const rows = await env.runtime.runPromise(
    Effect.flatMap(TickRepository, (repo) => repo.list({ strategyId: STRATEGY, limit: 5 })),
  );
  return rows[0];
};

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

describe("in-flight ticks reconcile on the clock", () => {
  test("a tick left in flight is settled by the running loop without a restart", async () => {
    env = world();
    const booted = await drive(env);
    env.script.transaction = () => null;
    plantSettled(env.db, "confirmed");
    await plantTick(env);
    env.clock.now = START + EVERY;
    await booted.runDue();
    expect((await tick(env))?.outcome).toBe("in_flight");
    expect(env.notes).toHaveLength(0);
    env.script.transaction = () => ({ meta: { fee: 105_000n } });
    await booted.runDue();
    expect(await tick(env)).toMatchObject({ outcome: "executed", finishedAt: env.clock.now });
    expect(env.notes).toEqual([{ kind: "settle", usd: spendUsd() }]);
    await booted.runDue();
    expect(env.notes).toHaveLength(1);
    await booted.stop();
  });

  test("boot reconciles an in-flight tick through the same pass", async () => {
    env = world();
    plantSettled(env.db, "confirmed");
    await plantTick(env);
    const booted = await drive(env);
    expect((await tick(env))?.outcome).toBe("executed");
    expect(env.notes).toEqual([{ kind: "settle", usd: spendUsd() }]);
    await booted.runDue();
    expect(env.notes).toHaveLength(1);
    await booted.stop();
  });

  test("an expired blockhash releases the hold and a repeat does not release again", async () => {
    env = world();
    env.script.status = () => null;
    env.script.height = () => 50n;
    env.script.transaction = () => null;
    const booted = await drive(env);
    plantSigned(env.db);
    await plantTick(env);
    await booted.runDue();
    expect((await tick(env))?.outcome).toBe("failed");
    expect(readIntent(env.db, INTENT).state).toBe("failed");
    expect(env.notes).toEqual([{ kind: "release" }]);
    await booted.runDue();
    expect(env.notes).toHaveLength(1);
    await booted.stop();
  });

  test("a landed execution error settles only the fee", async () => {
    env = world();
    plantSettled(env.db, "failed");
    await plantTick(env);
    await reconcileOpenTicks(env.runtime, env.db);
    expect((await tick(env))?.outcome).toBe("failed");
    expect(env.notes).toEqual([{ kind: "settle", usd: usdForLamports(FEE, QUOTE.solPriceUsd) }]);
  });

  test("overlapping reconciles settle a tick once", async () => {
    env = world();
    plantSettled(env.db, "confirmed");
    await plantTick(env);
    const first = reconcileOpenTicks(env.runtime, env.db);
    const second = reconcileOpenTicks(env.runtime, env.db);
    await Promise.all([first, second]);
    expect(env.script.feeCalls).toBe(1);
    expect(env.notes).toEqual([{ kind: "settle", usd: spendUsd() }]);
  });
});
