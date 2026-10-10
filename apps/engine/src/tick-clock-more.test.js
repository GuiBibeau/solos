// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

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

const clock = () => {
  const state = { now: 1_700_000_000_000 };
  return {
    now: () => state.now,
    advance: () => {
      state.now += EVERY;
    },
  };
};

const bounds = {
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "100",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
};

/** @param {string} to */
const draft = (to) => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [{ type: "transfer_sol", to, lamports: "1000000" }] },
  tickSource: { type: "clock", every: EVERY },
  bounds,
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

describe("more than one schedule [integration]", () => {
  test("two strategies due together both land, and a tick filter honors limit and outcome", async () => {
    const feed = prices();
    const time = clock();
    const engine = await boot(feed, time);
    try {
      const first = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft(await seedAddress(randomSeed())),
      });
      const second = await engineFetch(engine, "/v1/strategies", {
        method: "POST",
        body: draft(await seedAddress(randomSeed())),
      });
      time.advance();
      await engine.runDue();
      const left = await engineFetch(
        engine,
        `/v1/strategies/${first.body.id}/ticks?limit=1&outcome=executed`,
      );
      const missed = await engineFetch(
        engine,
        `/v1/strategies/${first.body.id}/ticks?outcome=missed`,
      );
      const right = await engineFetch(engine, `/v1/strategies/${second.body.id}/ticks`);
      expect(left.body.ticks).toHaveLength(1);
      expect(left.body.ticks[0].outcome).toBe("executed");
      expect(left.body.ticks[0].intents[0].signature).toEqual(expect.any(String));
      expect(missed.body.ticks).toHaveLength(0);
      expect(right.body.ticks[0].outcome).toBe("executed");
      expect(right.body.ticks[0].intents[0].signature).not.toBe(
        left.body.ticks[0].intents[0].signature,
      );
    } finally {
      await engine.stop();
      feed.stop();
    }
  });

  test("stopping across two intervals records one missed tick", async () => {
    const feed = prices();
    const time = clock();
    const dataDir = mkdtempSync(path.join(tmpdir(), "solos-missed-"));
    const first = await boot(feed, time, { tier: "simulate", dataDir, keepData: true });
    const registered = await engineFetch(first, "/v1/strategies", {
      method: "POST",
      body: draft(WSOL),
    });
    await first.stop();
    time.advance();
    time.advance();
    const second = await boot(feed, time, { tier: "simulate", dataDir, keepData: false });
    try {
      const ticks = await engineFetch(second, `/v1/strategies/${registered.body.id}/ticks`);
      const status = await engineFetch(second, `/v1/strategies/${registered.body.id}`);
      expect(ticks.body.ticks).toHaveLength(1);
      expect(ticks.body.ticks[0].outcome).toBe("missed");
      expect(status.body.nextDueAt).toBe(time.now() + EVERY);
    } finally {
      await second.stop();
      feed.stop();
    }
  });

  test("an in-flight tick is settled from its intent and is not sent again", async () => {
    const feed = prices();
    const time = clock();
    const dataDir = mkdtempSync(path.join(tmpdir(), "solos-inflight-"));
    const first = await boot(feed, time, { dataDir, keepData: true });
    const registered = await engineFetch(first, "/v1/strategies", {
      method: "POST",
      body: draft(await seedAddress(randomSeed())),
    });
    time.advance();
    await first.runDue();
    const before = await engineFetch(first, `/v1/strategies/${registered.body.id}/ticks`);
    const signature = before.body.ticks[0].intents[0].signature;
    const lamports = await balance(first.surfnet.rpcUrl, first.signer);
    await first.stop();
    reopen(dataDir);
    const second = await boot(feed, time, { dataDir, keepData: false });
    try {
      const after = await engineFetch(second, `/v1/strategies/${registered.body.id}/ticks`);
      expect(after.body.ticks[0].outcome).toBe("executed");
      expect(after.body.ticks[0].intents[0].signature).toBe(signature);
      expect(await balance(second.surfnet.rpcUrl, first.signer)).toBe(lamports);
    } finally {
      await second.stop();
      feed.stop();
    }
  });
});

/** @param {string} dataDir */
const reopen = (dataDir) => {
  const db = new Database(path.join(dataDir, "intents.sqlite"));
  const row = db.query("SELECT tick_id, body FROM ticks").get();
  const tick = JSON.parse(/** @type {{ body: string }} */ (row).body);
  tick.outcome = "in_flight";
  tick.finishedAt = null;
  db.query("UPDATE ticks SET outcome = ?, body = ? WHERE tick_id = ?").run(
    "in_flight",
    JSON.stringify(tick),
    /** @type {{ tick_id: string }} */ (row).tick_id,
  );
  db.close();
};

/** @param {string} rpcUrl @param {string} signer */
const balance = async (rpcUrl, signer) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [signer] }),
  });
  const body = await response.json();
  return body.result.value;
};
