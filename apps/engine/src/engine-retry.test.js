// @ts-check
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ActionExecutor } from "@solos/core";
import { EngineExecutor } from "@solos/solana";
import { jsonRpc, randomSeed, seedAddress } from "@solos/solana/surfnet";
import { Cause, Effect, Exit, Option } from "effect";
import { engineFetch, startTestEngine } from "./engine-fixture.js";

/** @typedef {import("@solos-sh/actions").Action} Action */
/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

/** @type {TestEngine | undefined} */
let engine;
/** @type {string | undefined} */
let callerDir;

const current = () => {
  if (engine === undefined || callerDir === undefined) throw new Error("engine did not start");
  return { engine, callerDir };
};

/** @param {string} to @param {string} lamports */
const transfer = (to, lamports) => /** @type {Action} */ ({ type: "transfer_sol", to, lamports });

/**
 * @param {{ url: string; token: string; intentFile: string }} endpoint
 * @param {Action} action
 */
const executeExit = (endpoint, action) =>
  Effect.runPromise(
    Effect.exit(
      Effect.flatMap(ActionExecutor, (executor) =>
        executor.execute(action, { skipSimulation: false }),
      ),
    ).pipe(Effect.provide(EngineExecutor(endpoint))),
  );

/** @param {import("effect/Exit").Exit<unknown, unknown>} exit */
const failureTag = (exit) => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure) || failure.value === null || typeof failure.value !== "object") {
    return undefined;
  }
  return "_tag" in failure.value ? String(failure.value._tag) : undefined;
};

/** @param {string} rpcUrl @param {string} address */
const signaturesOf = async (rpcUrl, address) => {
  const rows = await jsonRpc(rpcUrl, "getSignaturesForAddress", [address, { limit: 1000 }]);
  return /** @type {Array<{ signature: string }>} */ (rows).map((row) => row.signature);
};

/**
 * The engine has already answered. The caller sees a non-envelope so the response counts as lost.
 * @param {string} upstream
 */
const dropFirstExecute = (upstream) => {
  let didDrop = false;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      const response = await fetch(`${upstream}${url.pathname}`, {
        method: request.method,
        headers: forwardHeaders(request),
        body: request.method === "GET" ? undefined : await request.text(),
      });
      const text = await response.text();
      if (!didDrop && url.pathname === "/v1/actions/execute") {
        didDrop = true;
        return new Response("lost", { status: 500 });
      }
      return new Response(text, {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}`,
    dropped: () => didDrop,
    stop: () => server.stop(true),
  };
};

/** @param {Request} request */
const forwardHeaders = (request) => {
  /** @type {Record<string, string>} */
  const headers = {};
  const authorization = request.headers.get("authorization");
  if (authorization !== null) headers.authorization = authorization;
  const type = request.headers.get("content-type");
  if (type !== null) headers["content-type"] = type;
  return headers;
};

/** @param {string} file */
const openIntentId = (file) => {
  const db = new Database(file, { readonly: true });
  const row = db.query("SELECT intent_id FROM caller_intents").get();
  db.close();
  if (row === null) throw new Error("caller intent was not kept for the retry");
  return /** @type {{ intent_id: string }} */ (row).intent_id;
};

describe("caller retries reuse one intent [integration]", () => {
  /** @type {string} */
  let recipient;

  beforeAll(async () => {
    engine = await startTestEngine({ tier: "execute", allowedMints: [] });
    callerDir = mkdtempSync(path.join(tmpdir(), "solos-caller-intent-"));
    recipient = await seedAddress(randomSeed());
  });

  afterAll(async () => {
    await engine?.stop();
    if (callerDir !== undefined) rmSync(callerDir, { recursive: true, force: true });
  });

  test("a retried execute produces exactly one execution", async () => {
    const { engine: running, callerDir: dir } = current();
    const intentFile = path.join(dir, "engine-intents.sqlite");
    const gate = dropFirstExecute(running.url);
    const endpoint = { url: gate.url, token: running.token, intentFile };
    const action = transfer(recipient, "1000000");
    const before = await signaturesOf(running.surfnet.rpcUrl, running.signer);
    try {
      const first = await executeExit(endpoint, action);
      expect(failureTag(first)).toBe("EngineUnavailable");
      expect(gate.dropped()).toBe(true);
      const intentId = openIntentId(intentFile);
      const second = await executeExit(endpoint, action);
      expect(Exit.isSuccess(second)).toBe(true);
      if (!Exit.isSuccess(second)) return;
      const after = await signaturesOf(running.surfnet.rpcUrl, running.signer);
      expect(after.length).toBe(before.length + 1);
      expect(after).toContain(second.value.signature);
      const stored = await engineFetch(running, `/v1/intents/${intentId}`);
      expect(stored.body.state).toBe("settled");
      expect(stored.body.result.signature).toBe(second.value.signature);
    } finally {
      gate.stop();
    }
  }, 120_000);
});
