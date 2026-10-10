// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress } from "@solos/solana/surfnet";
import { runSolos } from "../../cli/src/commands/cli-fixture.js";
import { ENGINE_TOKEN, startTestEngine } from "./engine-fixture.js";

/** @typedef {Awaited<ReturnType<typeof startTestEngine>>} TestEngine */

/** @type {TestEngine | undefined} */
let engine;
/** @type {string | undefined} */
let configDir;
/** @type {string | undefined} */
let recipient;

const current = () => {
  if (engine === undefined || configDir === undefined || recipient === undefined) {
    throw new Error("engine did not start");
  }
  return { engine, configDir, recipient };
};

describe("callers with SOLOS_EXECUTOR=engine and no local signer [integration]", () => {
  beforeAll(async () => {
    engine = await startTestEngine();
    configDir = mkdtempSync(path.join(tmpdir(), "solos-engine-caller-"));
    recipient = await seedAddress(randomSeed());
  });

  afterAll(async () => {
    await engine?.stop();
    if (configDir !== undefined) rmSync(configDir, { recursive: true, force: true });
  });

  test("transfer simulate matches the direct signer and mcp call matches that shape", async () => {
    const { engine: running, configDir: dir, recipient: to } = current();
    const shared = {
      SOLANA_RPC_URL: running.surfnet.rpcUrl,
      SOLANA_WS_URL: running.surfnet.wsUrl,
      SOLOS_CONFIG_DIR: dir,
      SOLOS_LOG_LEVEL: "warn",
      SOLOS_TOOL_TIER: "simulate",
      SOLOS_TOOLS: "all",
    };
    const args = ["transfer", "sol", "--to", to, "--amount", "0.001", "--simulate-only"];
    const direct = await runSolos(args, {
      ...shared,
      SOLOS_SIGNER_PRIVATE_KEY: running.privateKey,
    });
    const remote = await runSolos(args, {
      ...shared,
      SOLOS_EXECUTOR: "engine",
      SOLOS_ENGINE_URL: running.url,
      SOLOS_ENGINE_TOKEN: running.token,
    });
    expect(direct.code).toBe(0);
    expect(remote.code).toBe(0);
    const directBody = JSON.parse(direct.stdout);
    const remoteBody = JSON.parse(remote.stdout);
    expect(remoteBody).toEqual(directBody);
    expect(remoteBody.from).toBe(running.signer);
    expect(remoteBody.lamports).toBe("1000000");

    const mcp = await runSolos(
      [
        "mcp",
        "call",
        "solana_transfer_simulate_sol",
        "--args",
        JSON.stringify({ to, amountSol: "0.001" }),
      ],
      {
        ...shared,
        SOLOS_EXECUTOR: "engine",
        SOLOS_ENGINE_URL: running.url,
        SOLOS_ENGINE_TOKEN: running.token,
      },
    );
    expect(mcp.code).toBe(0);
    const called = JSON.parse(mcp.stdout);
    expect(called.isError).toBeFalsy();
    expect(called.structuredContent).toEqual(remoteBody);
    const logs = running.logs();
    expect(logs).toContain("tool.completed");
    expect(logs).toContain("engine.action.simulate");
    expect(logs.includes(ENGINE_TOKEN)).toBe(false);
  });
});
