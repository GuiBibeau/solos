// @ts-check
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { broadcastFailingTransfer, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { claimIntent, openIntents, recordSigned } from "./intents.js";
import { lamportsToUsd } from "./sol-notional.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

const WSOL = "So11111111111111111111111111111111111111112";
const INTENT = "landed-fee";

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

/**
 * @param {ReturnType<typeof prices>} feed
 * @param {string} dataDir
 * @param {boolean} keepData
 */
const boot = (feed, dataDir, keepData) =>
  startTestEngine({
    tier: "execute",
    strategies: true,
    allowedMints: [WSOL],
    dataDir,
    keepData,
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
        maxNotionalPerTickUsd: "5",
        maxDailySpendUsd: "5",
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
 * @param {string} dataDir
 * @param {string} strategyId
 * @param {{ signature: string; to: string }} landed
 */
const plant = (dataDir, strategyId, landed) => {
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  const day = new Date().toISOString().slice(0, 10);
  claimIntent(db, INTENT, { action: transfer(landed.to, "1"), simulated: false });
  recordSigned(db, INTENT, { signature: landed.signature, lastValidBlockHeight: 1n << 50n });
  db.query(
    `INSERT INTO cap_reservations (
      reservation_id, strategy_id, tick_id, intent_id, mint, notional_usd, day, status
    ) VALUES ('res_landed', ?, 'tick-landed', ?, ?, '2', ?, 'open')`,
  ).run(strategyId, INTENT, WSOL, day);
  db.close();
};

/** @param {TestEngine} engine */
const waitSettled = async (engine) => {
  const deadline = Date.now() + 15_000;
  let looked = await engineFetch(engine, `/v1/intents/${INTENT}`);
  while (looked.body.state === "in_flight" && Date.now() < deadline) {
    await Bun.sleep(250);
    looked = await engineFetch(engine, `/v1/intents/${INTENT}`);
  }
  return looked;
};

/** @param {string} dataDir */
const holdOf = (dataDir) => {
  const db = openIntents(path.join(dataDir, "intents.sqlite"));
  const row = db
    .query("SELECT status, actual_usd AS actual FROM cap_reservations WHERE intent_id = ?")
    .get(INTENT);
  db.close();
  return /** @type {{ status: string; actual: string | null }} */ (row);
};

describe("a landed execution error settles the paid fee [integration]", () => {
  test("recovery settles the fee meta.fee reports", async () => {
    const feed = prices();
    const dataDir = mkdtempSync(path.join(tmpdir(), "cap-landed-fee-"));
    const first = await boot(feed, dataDir, true);
    const strategyId = await register(first);
    const payer = randomSeed();
    const payerAddress = await seedAddress(payer);
    const to = await seedAddress(randomSeed());
    await first.surfnet.cheats.fundSol(payerAddress, 1);
    const landed = await broadcastFailingTransfer(first.surfnet.rpcUrl, payer, to);
    expect(landed.fee > 0n).toBe(true);
    await first.stop();
    plant(dataDir, strategyId, { signature: landed.signature, to });
    const second = await boot(feed, dataDir, false);
    try {
      const looked = await waitSettled(second);
      expect(looked.body).toMatchObject({
        state: "settled",
        result: { status: "failed", signature: landed.signature },
      });
      expect(holdOf(dataDir)).toEqual({
        status: "settled",
        actual: lamportsToUsd(landed.fee.toString(), "100"),
      });
    } finally {
      await second.stop();
      feed.stop();
    }
  }, 120_000);
});
