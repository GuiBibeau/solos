// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { claimIntent, openIntents, recordSigned } from "./intents.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

const WSOL = "So11111111111111111111111111111111111111112";
const TWO = "20000000";
const ABSENT =
  "QbyjxkUEScca7wNvchAVuhSoP9g3FLAvMqSpgsV4sDgrUGAnUT8dXsap25oQKsnKUTQhRpASjKKTDQvPdSZWi9z";

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

/** @param {ReturnType<typeof prices>} feed @param {string} dataDir */
const boot = (feed, dataDir) =>
  startTestEngine({
    tier: "execute",
    strategies: true,
    allowedMints: [WSOL],
    dataDir,
    keepData: true,
    env: { JUPITER_API_KEY: "test-key", JUPITER_BASE_URL: feed.url },
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

/** @param {string} dataDir @param {string} intentId */
const statusOf = (dataDir, intentId) => {
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  const row = db.query("SELECT status FROM cap_reservations WHERE intent_id = ?").get(intentId);
  db.close();
  return /** @type {{ status: string }} */ (row).status;
};

/** @param {string} dataDir @param {string} strategyId @param {string} to */
const plant = (dataDir, strategyId, to) => {
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  const day = new Date().toISOString().slice(0, 10);
  claimIntent(db, "expired-intent", { action: transfer(to, TWO), simulated: true });
  recordSigned(db, "expired-intent", { signature: ABSENT, lastValidBlockHeight: 0n });
  claimIntent(db, "unsigned-intent", { action: transfer(to, TWO), simulated: true });
  for (const intentId of ["expired-intent", "unsigned-intent"]) {
    db.query(
      `INSERT INTO cap_reservations (
        reservation_id, strategy_id, tick_id, intent_id, mint, notional_usd, day, status
      ) VALUES (?, ?, 'tick-plant', ?, ?, '2', ?, 'open')`,
    ).run(`res_${intentId}`, strategyId, intentId, WSOL, day);
  }
  db.close();
};

describe("failed recovery releases the hold [integration]", () => {
  test("an expired blockhash and an unsigned intent both release, so the cap is free", async () => {
    const feed = prices();
    const dataDir = mkdtempSync(path.join(tmpdir(), "cap-expire-"));
    const first = await boot(feed, dataDir);
    const strategyId = await register(first);
    const to = await seedAddress(randomSeed());
    await first.stop();
    plant(dataDir, strategyId, to);
    const second = await boot(feed, dataDir);
    try {
      const expired = await engineFetch(second, "/v1/intents/expired-intent");
      const unsigned = await engineFetch(second, "/v1/intents/unsigned-intent");
      expect(expired.body).toMatchObject({
        state: "failed",
        error: { code: "TransactionExpired" },
      });
      expect(unsigned.body).toMatchObject({
        state: "failed",
        error: { code: "TransactionFailed" },
      });
      expect(statusOf(dataDir, "expired-intent")).toBe("released");
      expect(statusOf(dataDir, "unsigned-intent")).toBe("released");
      const sent = await engineFetch(second, "/v1/actions/execute", {
        method: "POST",
        body: {
          action: transfer(to, TWO),
          intentId: crypto.randomUUID(),
          strategyId,
          tickId: "tick-fresh",
        },
      });
      expect(sent.status).toBe(200);
    } finally {
      await second.stop();
      feed.stop();
    }
  }, 120_000);
});
