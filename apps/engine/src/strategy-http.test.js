// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { registryConformance } from "@solos/core";
import { HttpStrategyRegistry } from "@solos/solana";
import { Effect } from "effect";
import { ENGINE_TOKEN, engineFetch, startTestEngine } from "./engine-fixture.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const prices = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const ids = new URL(request.url).searchParams.get("ids") ?? USDC;
      return Response.json({ [ids]: { usdPrice: 150 } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

const draft = () => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [{ type: "transfer_sol", to: USDC, lamports: "1" }] },
  tickSource: { type: "clock", every: 60_000 },
  bounds: {
    maxNotionalPerTickUsd: "1",
    maxDailySpendUsd: "2",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 2,
  },
});

/** @param {ReturnType<typeof prices>} feed @param {string} [dataDir] @param {boolean} [keepData] */
const boot = (feed, dataDir, keepData) =>
  startTestEngine({
    strategies: true,
    allowedMints: [USDC],
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    ...(dataDir !== undefined && { dataDir, keepData: keepData === true }),
  });

describe("strategy registry over HTTP [integration]", () => {
  /** @type {ReturnType<typeof prices> | undefined} */
  let feed;
  /** @type {Awaited<ReturnType<typeof startTestEngine>> | undefined} */
  let engine;

  beforeAll(async () => {
    feed = prices();
    engine = await boot(feed);
  });

  afterAll(async () => {
    await engine?.stop();
    feed?.stop();
  });

  const current = () => {
    if (engine === undefined) throw new Error("engine did not start");
    return engine;
  };

  test("the HTTP adapter and the in-process registry share one conformance script", async () => {
    const running = current();
    await Effect.runPromise(
      registryConformance.pipe(
        Effect.provide(HttpStrategyRegistry({ url: running.url, token: running.token })),
      ),
    );
  });

  test("a missing or wrong bearer on a strategy route is 401 and the token stays out of logs", async () => {
    const running = current();
    const missing = await engineFetch(running, "/v1/strategies", { token: false });
    const wrong = await engineFetch(running, "/v1/strategies", { token: "nope" });
    const posted = await engineFetch(running, "/v1/strategies", {
      method: "POST",
      token: false,
      body: draft(),
    });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(posted.status).toBe(401);
    expect(missing.body.error.code).toBe("EngineUnauthorized");
    expect(running.logs().includes(ENGINE_TOKEN)).toBe(false);
  });
});

describe("strategy rows survive an engine restart [integration]", () => {
  test("list still returns the strategy after the process stops", async () => {
    const feed = prices();
    const dataDir = mkdtempSync(path.join(tmpdir(), "solos-strategy-"));
    const first = await boot(feed, dataDir, true);
    const registered = await engineFetch(first, "/v1/strategies", {
      method: "POST",
      body: draft(),
    });
    expect(registered.status).toBe(200);
    const id = registered.body.id;
    await first.stop();
    const second = await boot(feed, dataDir, false);
    try {
      const listed = await engineFetch(second, "/v1/strategies");
      expect(
        listed.body.strategies.some((/** @type {{ id: string }} */ row) => row.id === id),
      ).toBe(true);
    } finally {
      await second.stop();
      feed.stop();
    }
  });
});

describe("a dry engine allowlist [integration]", () => {
  test("omitting --allowed-mints allows any mint", async () => {
    const feed = prices();
    const engine = await startTestEngine({
      strategies: true,
      env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    });
    try {
      const posted = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: {
          ...draft(),
          bounds: { ...draft().bounds, allowedMints: [USDC] },
        },
      });
      expect(posted.status).toBe(200);
    } finally {
      await engine.stop();
      feed.stop();
    }
  });
});

describe("strategy routes without the STRATEGIES flag [integration]", () => {
  test("a strategy path is EngineUnavailable and the remedy names the flag", async () => {
    const engine = await startTestEngine();
    try {
      const response = await engineFetch(engine, "/v1/strategies");
      expect(response.status).toBe(404);
      expect(response.body.error).toMatchObject({
        code: "EngineUnavailable",
        remedy: expect.stringContaining("STRATEGIES"),
      });
    } finally {
      await engine.stop();
    }
  });
});
