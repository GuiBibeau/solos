// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { ENGINE_TOKEN, engineFetch, startTestEngine } from "./engine-fixture.js";

/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

/** @type {TestEngine | undefined} */
let engine;
/** @type {string | undefined} */
let recipient;

const current = () => {
  if (engine === undefined || recipient === undefined) throw new Error("engine did not start");
  return { engine, recipient };
};

/** @param {string} logs */
const readyLine = (logs) => {
  const line = logs.split("\n").find((item) => item.includes('"message":"solos engine ready"'));
  if (line === undefined) throw new Error("missing ready line");
  return JSON.parse(line);
};

describe("engine HTTP surface [integration]", () => {
  beforeAll(async () => {
    engine = await startTestEngine();
    recipient = await seedAddress(randomSeed());
  });

  afterAll(async () => {
    await engine?.stop();
  });

  test("a missing bearer is 401 and the body does not contain the token", async () => {
    const { engine: running } = current();
    const response = await engineFetch(running, "/v1/health", { token: false });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("EngineUnauthorized");
    expect(JSON.stringify(response.body).includes(ENGINE_TOKEN)).toBe(false);
  });

  test("health reports the dry simulate ceiling and the signer", async () => {
    const { engine: running } = current();
    const response = await engineFetch(running, "/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      tier: "simulate",
      mode: "dry",
      signer: running.signer,
      rpcHost: new URL(running.surfnet.rpcUrl).origin,
    });
    expect(typeof response.body.uptimeMs).toBe("number");
  });

  test("execute is refused at the simulate tier and names --tier execute", async () => {
    const { engine: running, recipient: to } = current();
    const response = await engineFetch(running, "/v1/actions/execute", {
      method: "POST",
      body: { action: { type: "transfer_sol", to, lamports: "1000000" } },
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("TierWithheld");
    expect(response.body.error.reason).toContain("simulate");
    expect(response.body.error.remedy).toContain("--tier execute");
  });

  test("simulate succeeds and stderr shows the span without the token", async () => {
    const { engine: running, recipient: to } = current();
    const response = await engineFetch(running, "/v1/actions/simulate", {
      method: "POST",
      body: { action: { type: "transfer_sol", to, lamports: "1000000" } },
    });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    const logs = running.logs();
    const ready = readyLine(logs);
    expect(ready).toMatchObject({
      signer: running.signer,
      tier: "simulate",
      mode: "dry",
      dataDir: running.dataDir,
      rpcHost: new URL(running.surfnet.rpcUrl).origin,
      url: running.url,
    });
    expect(logs).toContain("tool.completed");
    expect(logs).toContain("engine.action.simulate");
    expect(logs.includes(ENGINE_TOKEN)).toBe(false);
    expect(logs.includes(running.privateKey)).toBe(false);
  });
});
