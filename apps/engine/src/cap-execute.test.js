// @ts-check
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ONE = "10000000";

/** @param {string} usd */
const prices = (usd) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const ids = new URL(request.url).searchParams.get("ids") ?? WSOL;
      return Response.json({ [ids]: { usdPrice: Number(usd) } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {Record<string, unknown>} bounds */
const draft = (bounds) => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [{ type: "transfer_sol", to: WSOL, lamports: "1" }] },
  tickSource: { type: "clock", every: 60_000 },
  bounds,
});

/**
 * @param {ReturnType<typeof prices>} feed
 * @param {{ dataDir?: string; keepData?: boolean; allowedMints: readonly string[] }} options
 */
const boot = (feed, options) =>
  startTestEngine({
    tier: "execute",
    strategies: true,
    allowedMints: options.allowedMints,
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    ...(options.dataDir !== undefined && {
      dataDir: options.dataDir,
      keepData: options.keepData === true,
    }),
  });

/** @param {TestEngine} engine @param {Record<string, unknown>} bounds */
const register = async (engine, bounds) => {
  const posted = await engineFetch(engine, "/v1/strategies", {
    method: "POST",
    body: draft(bounds),
  });
  expect(posted.status).toBe(200);
  return /** @type {{ id: string }} */ (posted.body).id;
};

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 1000 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

/**
 * @param {TestEngine} engine
 * @param {{ to: string; lamports: string; strategyId: string; tickId: string }} input
 */
const execute = (engine, input) =>
  engineFetch(engine, "/v1/actions/execute", {
    method: "POST",
    body: {
      action: /** @type {Action} */ ({
        type: "transfer_sol",
        to: input.to,
        lamports: input.lamports,
      }),
      intentId: crypto.randomUUID(),
      strategyId: input.strategyId,
      tickId: input.tickId,
    },
  });

describe("execute under a Strategy cap [integration]", () => {
  /** @type {ReturnType<typeof prices> | undefined} */
  let feed;

  afterAll(() => feed?.stop());

  test("a per-tick cap, a kill switch, and a daily cap survive an Engine restart", async () => {
    feed = prices("100");
    const dataDir = mkdtempSync(path.join(tmpdir(), "cap-execute-"));
    const bounds = {
      maxNotionalPerTickUsd: "1",
      maxDailySpendUsd: "2",
      allowedMints: [WSOL],
      expiresAt: null,
      maxConsecutiveFailures: 2,
    };
    const first = await boot(feed, { dataDir, keepData: true, allowedMints: [WSOL] });
    const strategyId = await register(first, bounds);
    const to = await seedAddress(randomSeed());
    const before = await signaturesOf(first.surfnet.rpcUrl, first.signer);
    const sent = await execute(first, { to, lamports: ONE, strategyId, tickId: "tick-a" });
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe("confirmed");
    const afterSend = await signaturesOf(first.surfnet.rpcUrl, first.signer);
    expect(afterSend.length).toBe(before.length + 1);
    const sameTick = await execute(first, { to, lamports: ONE, strategyId, tickId: "tick-a" });
    expect(sameTick.status).toBe(422);
    expect(sameTick.body.error.code).toBe("BoundsExceeded");
    expect(sameTick.body.error.bound).toBe("maxNotionalPerTickUsd");
    expect(await signaturesOf(first.surfnet.rpcUrl, first.signer)).toEqual(afterSend);
    const killed = await engineFetch(first, "/v1/strategies/kill", {
      method: "POST",
      body: { scope: "global", reason: "operator stop" },
    });
    expect(killed.body).toEqual({ scope: "global", engaged: true, reason: "operator stop" });
    const blocked = await execute(first, { to, lamports: ONE, strategyId, tickId: "tick-b" });
    expect(blocked.status).toBe(423);
    expect(blocked.body.error.code).toBe("KillSwitchEngaged");
    expect(await signaturesOf(first.surfnet.rpcUrl, first.signer)).toEqual(afterSend);
    await first.stop();

    const second = await boot(feed, { dataDir, keepData: true, allowedMints: [WSOL] });
    try {
      const status = await engineFetch(second, "/v1/strategies/kill?scope=global");
      expect(status.body).toEqual({ scope: "global", engaged: true, reason: "operator stop" });
      const still = await execute(second, { to, lamports: ONE, strategyId, tickId: "tick-b" });
      expect(still.status).toBe(423);
      const beforeSecond = await signaturesOf(second.surfnet.rpcUrl, second.signer);
      expect(await signaturesOf(second.surfnet.rpcUrl, second.signer)).toEqual(beforeSecond);
      const lifted = await engineFetch(second, "/v1/strategies/kill/disengage", {
        method: "POST",
        body: { scope: "global" },
      });
      expect(lifted.body).toEqual({ scope: "global", engaged: false, reason: null });
      const next = await execute(second, { to, lamports: ONE, strategyId, tickId: "tick-b" });
      expect(next.status).toBe(200);
      const daily = await execute(second, { to, lamports: ONE, strategyId, tickId: "tick-c" });
      expect(daily.status).toBe(422);
      expect(daily.body.error.bound).toBe("maxDailySpendUsd");
      const after = await signaturesOf(second.surfnet.rpcUrl, second.signer);
      expect(after.length).toBe(beforeSecond.length + 1);
    } finally {
      await second.stop();
    }
  }, 180_000);
});

describe("the Engine allowlist [integration]", () => {
  test("a mint outside the Engine list is BoundsExceeded and sends nothing", async () => {
    const feed = prices("100");
    const engine = await boot(feed, { allowedMints: [USDC] });
    try {
      const strategyId = await register(engine, {
        maxNotionalPerTickUsd: "5",
        maxDailySpendUsd: "5",
        allowedMints: [],
        expiresAt: null,
        maxConsecutiveFailures: 2,
      });
      const to = await seedAddress(randomSeed());
      const before = await signaturesOf(engine.surfnet.rpcUrl, engine.signer);
      const refused = await execute(engine, { to, lamports: ONE, strategyId, tickId: "tick-a" });
      expect(refused.status).toBe(422);
      expect(refused.body.error.reason).toContain("Engine allowlist");
      expect(await signaturesOf(engine.surfnet.rpcUrl, engine.signer)).toEqual(before);
    } finally {
      await engine.stop();
      feed.stop();
    }
  }, 120_000);

  test("--allowed-mints any starts and a SOL transfer is allowed", async () => {
    const feed = prices("100");
    const engine = await boot(feed, { allowedMints: [] });
    try {
      const strategyId = await register(engine, {
        maxNotionalPerTickUsd: "5",
        maxDailySpendUsd: "5",
        allowedMints: [],
        expiresAt: null,
        maxConsecutiveFailures: 2,
      });
      const to = await seedAddress(randomSeed());
      const before = await signaturesOf(engine.surfnet.rpcUrl, engine.signer);
      const sent = await execute(engine, { to, lamports: ONE, strategyId, tickId: "tick-any" });
      expect(sent.status).toBe(200);
      expect(sent.body.status).toBe("confirmed");
      const after = await signaturesOf(engine.surfnet.rpcUrl, engine.signer);
      expect(after.length).toBe(before.length + 1);
    } finally {
      await engine.stop();
      feed.stop();
    }
  }, 120_000);
});
