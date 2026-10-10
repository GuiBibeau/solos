// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureSurfnet, jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

const WSOL = "So11111111111111111111111111111111111111112";
const TWO = "20000000";
const ONE = "10000000";

/** @param {string} to @param {string} lamports */
const transfer = (to, lamports) => /** @type {Action} */ ({ type: "transfer_sol", to, lamports });

const prices = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const ids = new URL(request.url).searchParams.get("ids") ?? WSOL;
      return Response.json({ [ids]: { usdPrice: 100 } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** Status lookups stay pending until goLive. Sends and block height are forwarded. @param {string} upstream */
const pendingProxy = (upstream) => {
  let isSynthetic = true;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => forward(request, upstream, () => isSynthetic),
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    goLive: () => {
      isSynthetic = false;
    },
    stop: () => server.stop(true),
  };
};

/** @param {Request} request @param {string} upstream @param {() => boolean} isHeld */
const forward = async (request, upstream, isHeld) => {
  const text = await request.text();
  const synthetic = isHeld() ? pendingStatuses(text) : undefined;
  if (synthetic !== undefined) return Response.json(synthetic);
  const response = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: text,
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
};

/** @param {string} text */
const pendingStatuses = (text) => {
  try {
    const body = JSON.parse(text);
    const calls = Array.isArray(body) ? body : [body];
    if (calls.some((call) => call?.method !== "getSignatureStatuses")) return undefined;
    const replies = calls.map((call) => ({
      jsonrpc: "2.0",
      id: call.id,
      result: { context: { slot: 1 }, value: [null] },
    }));
    return Array.isArray(body) ? replies : replies[0];
  } catch {
    return undefined;
  }
};

/** @param {string} file */
const waitForSignature = async (file) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const db = new Database(file, { readonly: true });
    const row = db
      .query("SELECT intent_id, signature FROM intents WHERE signature IS NOT NULL")
      .get();
    db.close();
    if (row !== null) return /** @type {{ intent_id: string; signature: string }} */ (row);
    await Bun.sleep(100);
  }
  throw new Error("signature was not stored");
};

/** @param {string} rpcUrl @param {string} signature */
const waitConfirmed = async (rpcUrl, signature) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const rows = await jsonRpc(rpcUrl, "getSignatureStatuses", [
      [signature],
      { searchTransactionHistory: true },
    ]);
    const status = /** @type {{ value?: Array<{ confirmationStatus?: string } | null> }} */ (rows)
      .value?.[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized")
      return;
    await Bun.sleep(200);
  }
  throw new Error("surfpool did not confirm the sent signature");
};

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 1000 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

/** @param {string} fromFile @param {string} toDir */
const snapshotDb = (fromFile, toDir) => {
  const db = new Database(fromFile);
  db.exec("PRAGMA wal_checkpoint(FULL)");
  const bytes = db.serialize();
  db.close();
  mkdirSync(toDir, { recursive: true });
  writeFileSync(path.join(toDir, "intents.sqlite"), bytes);
};

/** @param {string} dir @param {string} intentId */
const holdOf = (dir, intentId) => {
  const db = new Database(path.join(dir, "intents.sqlite"), { readonly: true });
  const row = db
    .query("SELECT status, actual_usd AS actual FROM cap_reservations WHERE intent_id = ?")
    .get(intentId);
  const count = db
    .query("SELECT COUNT(*) AS n FROM cap_reservations WHERE intent_id = ?")
    .get(intentId);
  db.close();
  return {
    status: /** @type {{ status: string }} */ (row).status,
    actual: /** @type {{ actual: string | null }} */ (row).actual,
    n: /** @type {{ n: number }} */ (count).n,
  };
};

/** @param {ReturnType<typeof prices>} feed @param {string} dataDir @param {string} [rpcUrl] */
const boot = (feed, dataDir, rpcUrl) =>
  startTestEngine({
    tier: "execute",
    strategies: true,
    allowedMints: [WSOL],
    dataDir,
    keepData: true,
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
    ...(rpcUrl !== undefined && { rpcUrl }),
  });

/** @param {TestEngine} engine */
const register = async (engine) => {
  const posted = await engineFetch(engine, "/v1/strategies", {
    method: "POST",
    body: {
      owner: "swarm",
      kind: "schedule",
      params: { actions: [transfer(WSOL, "1")] },
      tickSource: { type: "clock", every: 60_000 },
      bounds: {
        maxNotionalPerTickUsd: "2.01",
        maxDailySpendUsd: "3.01",
        allowedMints: [WSOL],
        expiresAt: null,
        maxConsecutiveFailures: 2,
      },
    },
  });
  expect(posted.status).toBe(200);
  return /** @type {{ id: string }} */ (posted.body).id;
};

/**
 * @param {TestEngine} engine
 * @param {{ to: string; lamports: string; strategyId: string; tickId: string }} input
 */
const execute = (engine, input) =>
  engineFetch(engine, "/v1/actions/execute", {
    method: "POST",
    body: {
      action: transfer(input.to, input.lamports),
      intentId: crypto.randomUUID(),
      strategyId: input.strategyId,
      tickId: input.tickId,
    },
  });

describe("cap holds follow intent recovery [integration]", () => {
  test("a kill between send and confirm keeps the hold, then settles once when it lands", async () => {
    const surfnet = await ensureSurfnet();
    const feed = prices();
    const proxy = pendingProxy(surfnet.rpcUrl);
    const dataDir = mkdtempSync(path.join(tmpdir(), "cap-flight-"));
    /** @type {TestEngine | undefined} */
    let first;
    /** @type {TestEngine | undefined} */
    let second;
    try {
      first = await boot(feed, dataDir, proxy.url);
      const strategyId = await register(first);
      const to = await seedAddress(randomSeed());
      const intentId = crypto.randomUUID();
      const pending = engineFetch(first, "/v1/actions/execute", {
        method: "POST",
        body: { action: transfer(to, TWO), intentId, strategyId, tickId: "tick-a" },
      });
      const stored = await waitForSignature(path.join(dataDir, "intents.sqlite"));
      await waitConfirmed(surfnet.rpcUrl, stored.signature);
      const copyDir = path.join(tmpdir(), `cap-flight-copy-${intentId}`);
      snapshotDb(path.join(dataDir, "intents.sqlite"), copyDir);
      await first.stop();
      first = undefined;
      await pending.catch(() => undefined);
      second = await boot(feed, copyDir, proxy.url);
      expect(holdOf(copyDir, intentId)).toMatchObject({ status: "open", n: 1 });
      const to2 = await seedAddress(randomSeed());
      const before = await signaturesOf(surfnet.rpcUrl, second.signer);
      const refused = await execute(second, {
        to: to2,
        lamports: TWO,
        strategyId,
        tickId: "tick-b",
      });
      expect(refused.status).toBe(422);
      expect(refused.body.error.bound).toBe("maxDailySpendUsd");
      expect(await signaturesOf(surfnet.rpcUrl, second.signer)).toEqual(before);
      proxy.goLive();
      const looked = await engineFetch(second, `/v1/intents/${intentId}`);
      expect(looked.body.state).toBe("settled");
      expect(looked.body.result.status).toBe("confirmed");
      expect(looked.body.result.signature).toBe(stored.signature);
      expect(holdOf(copyDir, intentId)).toEqual({ status: "settled", actual: "2.0006", n: 1 });
      const replay = await engineFetch(second, `/v1/intents/${intentId}`);
      expect(replay.body.result.signature).toBe(stored.signature);
      expect(holdOf(copyDir, intentId).n).toBe(1);
      const fit = await execute(second, { to: to2, lamports: ONE, strategyId, tickId: "tick-c" });
      expect(fit.status).toBe(200);
      const over = await execute(second, { to: to2, lamports: ONE, strategyId, tickId: "tick-d" });
      expect(over.status).toBe(422);
      expect(over.body.error.bound).toBe("maxDailySpendUsd");
      expect((await signaturesOf(surfnet.rpcUrl, second.signer)).length).toBe(before.length + 1);
    } finally {
      await first?.stop();
      await second?.stop();
      proxy.stop();
      feed.stop();
    }
  }, 180_000);
});
