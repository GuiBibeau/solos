// @ts-check
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureSurfnet, jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { engineFetch, startTestEngine } from "./engine-fixture.js";
import { claimIntent, openIntents, recordSigned } from "./intents.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** @param {number[]} digits @param {number} byte */
const pushByte = (digits, byte) => {
  let carry = byte;
  for (let index = 0; index < digits.length; index += 1) {
    carry += (digits[index] ?? 0) << 8;
    digits[index] = carry % 58;
    carry = Math.floor(carry / 58);
  }
  while (carry > 0) {
    digits.push(carry % 58);
    carry = Math.floor(carry / 58);
  }
};

/** @param {Uint8Array} bytes */
const base58Encode = (bytes) => {
  /** @type {number[]} */
  const digits = [0];
  for (const byte of bytes) pushByte(digits, byte);
  let text = "";
  for (const byte of bytes) {
    if (byte !== 0) break;
    text += "1";
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) text += BASE58[digits[index] ?? 0];
  return text;
};

const randomSignature = () => base58Encode(crypto.getRandomValues(new Uint8Array(64)));

/** @param {string} to */
const transfer = (to) => /** @type {Action} */ ({ type: "transfer_sol", to, lamports: "1000000" });

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 1000 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

/**
 * Hold getSignatureStatuses so confirmation cannot finish. Everything else is forwarded.
 * @param {string} upstream
 */
const holdStatuses = (upstream) => {
  const gate = Promise.withResolvers();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => forward(request, upstream, gate.promise),
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    release: () => gate.resolve(undefined),
    stop: () => server.stop(true),
  };
};

/**
 * @param {Request} request
 * @param {string} upstream
 * @param {Promise<void>} gate
 */
const forward = async (request, upstream, gate) => {
  const text = await request.text();
  if (holdsStatus(text)) await gate;
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
const holdsStatus = (text) => {
  try {
    const body = JSON.parse(text);
    const calls = Array.isArray(body) ? body : [body];
    return calls.some((call) => call?.method === "getSignatureStatuses");
  } catch {
    return false;
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
  throw new Error("signature was not stored before broadcast");
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
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }
    await Bun.sleep(200);
  }
  throw new Error("surfpool did not confirm the sent signature");
};

/** @param {string} fromFile @param {string} toDir */
const snapshotDb = (fromFile, toDir) => {
  const db = new Database(fromFile);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA wal_checkpoint(FULL)");
  const bytes = db.serialize();
  db.close();
  mkdirSync(toDir, { recursive: true });
  writeFileSync(path.join(toDir, "intents.sqlite"), bytes);
};

/**
 * @param {{
 *   dataDir: string;
 *   intentId: string;
 *   action: Action;
 *   signature: string;
 *   height: bigint;
 * }} planted
 */
const plant = (planted) => {
  const db = openIntents(path.join(planted.dataDir, "intents.sqlite"));
  claimIntent(db, planted.intentId, { action: planted.action, simulated: true });
  recordSigned(db, planted.intentId, {
    signature: planted.signature,
    lastValidBlockHeight: planted.height,
  });
  db.close();
};

/**
 * @param {{ signature: string; height: bigint }} signed
 */
const restartPlanted = async (signed) => {
  const first = await startTestEngine({ tier: "execute", keepData: true });
  const { dataDir } = first;
  const to = await seedAddress(randomSeed());
  await first.stop();
  const intentId = crypto.randomUUID();
  plant({
    dataDir,
    intentId,
    action: transfer(to),
    signature: signed.signature,
    height: signed.height,
  });
  const engine = await startTestEngine({ tier: "execute", dataDir });
  return { engine, intentId, to };
};

describe("in-flight intent recovery [integration]", () => {
  test("a restart between send and confirm settles the landed signature and does not send again", async () => {
    const surfnet = await ensureSurfnet();
    const held = holdStatuses(surfnet.rpcUrl);
    /** @type {TestEngine | undefined} */
    let running;
    /** @type {TestEngine | undefined} */
    let restarted;
    try {
      running = await startTestEngine({ tier: "execute", rpcUrl: held.url });
      const signer = running.signer;
      const before = await signaturesOf(surfnet.rpcUrl, signer);
      const to = await seedAddress(randomSeed());
      const intentId = crypto.randomUUID();
      const pending = engineFetch(running, "/v1/actions/execute", {
        method: "POST",
        body: { action: transfer(to), intentId, skipSimulation: true },
      });
      const stored = await waitForSignature(path.join(running.dataDir, "intents.sqlite"));
      expect(stored.intent_id).toBe(intentId);
      await waitConfirmed(surfnet.rpcUrl, stored.signature);
      const copyDir = path.join(tmpdir(), `solos-engine-copy-${intentId}`);
      snapshotDb(path.join(running.dataDir, "intents.sqlite"), copyDir);
      held.release();
      const first = await pending;
      expect(first.status).toBe(200);
      await running.stop();
      running = undefined;
      restarted = await startTestEngine({ tier: "execute", dataDir: copyDir });
      const looked = await engineFetch(restarted, `/v1/intents/${intentId}`);
      expect(looked.body.state).toBe("settled");
      expect(looked.body.result.signature).toBe(stored.signature);
      const again = await engineFetch(restarted, "/v1/actions/execute", {
        method: "POST",
        body: { action: transfer(to), intentId, skipSimulation: true },
      });
      expect(again.status).toBe(200);
      expect(again.body.signature).toBe(stored.signature);
      const after = await signaturesOf(surfnet.rpcUrl, signer);
      expect(after.length).toBe(before.length + 1);
      expect(after.filter((signature) => signature === stored.signature)).toHaveLength(1);
    } finally {
      held.release();
      await running?.stop();
      await restarted?.stop();
      held.stop();
    }
  }, 180_000);

  test("an expired blockhash with no signature on chain ends failed", async () => {
    const planted = await restartPlanted({ signature: randomSignature(), height: 0n });
    try {
      const stored = await engineFetch(planted.engine, `/v1/intents/${planted.intentId}`);
      expect(stored.status).toBe(200);
      expect(stored.body.state).toBe("failed");
      expect(stored.body.error.code).toBe("TransactionExpired");
    } finally {
      await planted.engine.stop();
    }
  }, 120_000);

  test("a signed intent stays in flight and answers 409 until the blockhash expires", async () => {
    const planted = await restartPlanted({ signature: randomSignature(), height: 9_000_000_000n });
    try {
      const before = await signaturesOf(planted.engine.surfnet.rpcUrl, planted.engine.signer);
      const stored = await engineFetch(planted.engine, `/v1/intents/${planted.intentId}`);
      expect(stored.body.state).toBe("in_flight");
      const again = await engineFetch(planted.engine, "/v1/actions/execute", {
        method: "POST",
        body: { action: transfer(planted.to), intentId: planted.intentId, skipSimulation: true },
      });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe("IntentInFlight");
      const after = await signaturesOf(planted.engine.surfnet.rpcUrl, planted.engine.signer);
      expect(after).toEqual(before);
    } finally {
      await planted.engine.stop();
    }
  }, 120_000);
});
