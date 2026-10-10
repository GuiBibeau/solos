// @ts-check
import { describe, expect, test } from "bun:test";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { runSolos } from "../../cli/src/commands/cli-fixture.js";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";
const EVERY = 60_000;

const prices = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (!url.pathname.includes("/price/")) return new Response("no route", { status: 500 });
      const ids = url.searchParams.get("ids") ?? WSOL;
      return Response.json({
        [ids]: { usdPrice: 150, blockId: 1, decimals: 9, priceChange24h: 0 },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

const clock = (start = 1_700_000_000_000) => {
  const state = { now: start };
  return {
    now: () => state.now,
    advance: (ms = EVERY) => {
      state.now += ms;
    },
  };
};

const bounds = {
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "1000",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
};

/** @param {ReadonlyArray<Record<string, unknown>>} actions @param {Record<string, unknown>} [patch] */
const draft = (actions, patch = {}) => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions },
  tickSource: { type: "clock", every: EVERY },
  bounds,
  ...patch,
});

/** @param {ReturnType<typeof prices>} feed @param {ReturnType<typeof clock>} time @param {import("./engine-test-env.js").TestEngineOptions} [extra] */
const boot = (feed, time, extra = {}) =>
  startTestEngine({
    strategies: true,
    tier: "execute",
    allowedMints: [],
    now: time.now,
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    ...extra,
  });

/** @param {{ url: string; token: string }} engine @param {string} id */
const ticksOf = async (engine, id) => {
  const response = await engineFetch(engine, `/v1/strategies/${id}/ticks`);
  expect(response.status).toBe(200);
  return response.body.ticks;
};

describe("schedule ticks on surfpool [integration]", () => {
  test("a due tick lands a transfer the inspector can see", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time);
    try {
      const to = await seedAddress(randomSeed());
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([{ type: "transfer_sol", to, lamports: "1000000" }]),
      });
      expect(registered.status).toBe(200);
      time.advance();
      await engine.runDue();
      const ticks = await ticksOf(engine, registered.body.id);
      expect(ticks[0].outcome).toBe("executed");
      expect(
        Object.keys(ticks[0].observations).toSorted((left, right) => left.localeCompare(right)),
      ).toEqual(["instant", "lamports"]);
      expect(ticks[0].intents).toHaveLength(1);
      const status = await engineFetch(engine, `/v1/strategies/${registered.body.id}`);
      expect(status.body.lastTick.tickId).toBe(ticks[0].tickId);
      expect(status.body.nextDueAt).toBe(time.now() + EVERY);
      const inspected = await inspectLanded(ticks[0].intents[0].signature, engine);
      expect(inspected.signature).toBe(ticks[0].intents[0].signature);
      const printed = await runSolos(["strategy", "ticks", registered.body.id], {
        SOLOS_ENGINE_URL: engine.url,
        SOLOS_ENGINE_TOKEN: engine.token,
        SOLOS_LOG_LEVEL: "warn",
      });
      expect(printed.code).toBe(0);
      expect(JSON.parse(printed.stdout).ticks[0].tickId).toBe(ticks[0].tickId);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("three executed ticks finish the count and a fourth does not run", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time);
    try {
      const to = await seedAddress(randomSeed());
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([{ type: "transfer_sol", to, lamports: "1000000" }], {
          params: { actions: [{ type: "transfer_sol", to, lamports: "1000000" }], count: 3 },
        }),
      });
      for (let step = 0; step < 4; step += 1) {
        time.advance();
        await engine.runDue();
      }
      const ticks = await ticksOf(engine, registered.body.id);
      const status = await engineFetch(engine, `/v1/strategies/${registered.body.id}`);
      expect(
        ticks.filter((/** @type {{ outcome: string }} */ row) => row.outcome === "executed"),
      ).toHaveLength(3);
      expect(status.body.state).toBe("done");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("a forced swap failure stops at step 1 and keeps the transfer settled", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time);
    try {
      const to = await seedAddress(randomSeed());
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([
          { type: "transfer_sol", to, lamports: "1000000" },
          {
            type: "swap",
            inputMint: WSOL,
            outputMint: USDC,
            amount: "1000000",
            maxSlippageBps: 50,
          },
        ]),
      });
      time.advance();
      await engine.runDue();
      const ticks = await ticksOf(engine, registered.body.id);
      expect(ticks[0].outcome).toBe("failed");
      expect(ticks[0].step).toBe(1);
      expect(ticks[0].intents[0].state).toBe("settled");
      expect(ticks[0].intents[0].signature).toEqual(expect.any(String));
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("dry run records the swap and does not send", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time, { tier: "simulate" });
    try {
      const before = await balance(engine);
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([
          {
            type: "swap",
            inputMint: WSOL,
            outputMint: USDC,
            amount: "1000000",
            maxSlippageBps: 50,
          },
        ]),
      });
      time.advance();
      await engine.runDue();
      const ticks = await ticksOf(engine, registered.body.id);
      expect(ticks[0].outcome).toBe("evaluated");
      expect(ticks[0].actions).toHaveLength(1);
      expect(ticks[0].intents).toHaveLength(0);
      expect(await balance(engine)).toBe(before);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("an interval under the floor names the request and the floor", async () => {
    const feed = prices();
    const engine = await boot(feed, clock(), { tier: "simulate" });
    try {
      const refused = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([{ type: "transfer_sol", to: USDC, lamports: "1" }], {
          tickSource: { type: "clock", every: "1s" },
        }),
      });
      expect(refused.status).toBe(422);
      expect(refused.body.error.reason).toContain("1s");
      expect(refused.body.error.remedy).toContain("10s");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("pause stops the clock and resume schedules from the resume instant", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time, { tier: "simulate" });
    try {
      const registered = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft([{ type: "transfer_sol", to: USDC, lamports: "1" }]),
      });
      const id = registered.body.id;
      await engineFetch(engine, `/v1/strategies/${id}/state`, {
        method: "POST",
        body: { state: "paused" },
      });
      time.advance();
      await engine.runDue();
      expect(await ticksOf(engine, id)).toHaveLength(0);
      const resumedAt = time.now();
      await engineFetch(engine, `/v1/strategies/${id}/state`, {
        method: "POST",
        body: { state: "active" },
      });
      const status = await engineFetch(engine, `/v1/strategies/${id}`);
      expect(status.body.nextDueAt).toBe(resumedAt + EVERY);
      time.advance();
      await engine.runDue();
      expect((await ticksOf(engine, id))[0].outcome).toBe("evaluated");
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});

/**
 * Finalized visibility lags the Engine's confirmed send. The clock itself does not wait.
 * @param {string} signature
 * @param {{ surfnet: { rpcUrl: string }; privateKey: string; dataDir: string }} engine
 */
const inspectLanded = async (signature, engine) => {
  let stderr = "";
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const inspected = await runSolos(["dev", "inspect", "transaction", signature], {
      SOLOS_DEV: "1",
      SOLANA_RPC_URL: engine.surfnet.rpcUrl,
      SOLOS_SIGNER_PRIVATE_KEY: engine.privateKey,
      SOLOS_CONFIG_DIR: engine.dataDir,
      SOLOS_LOG_LEVEL: "warn",
    });
    if (inspected.code === 0) return JSON.parse(inspected.stdout);
    stderr = inspected.stderr;
    await Bun.sleep(100);
  }
  throw new Error(stderr);
};

/** @param {{ surfnet: { rpcUrl: string }; signer: string }} engine */
const balance = async (engine) => {
  const response = await fetch(engine.surfnet.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [engine.signer] }),
  });
  const body = await response.json();
  return body.result.value;
};
