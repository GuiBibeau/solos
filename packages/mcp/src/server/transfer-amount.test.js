// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

/** Unreachable loopback endpoint: nothing downstream of the boundary can answer here. */
const DEAD_RPC_URL = "http://127.0.0.1:1";
/** Keypair path that cannot exist: its directory is never created. */
const MISSING_KEYPAIR_PATH = path.join(
  tmpdir(),
  `solos-qa-missing-${crypto.randomUUID()}`,
  "keypair.json",
);

describe("transfer amount boundary over stdio MCP, offline [integration]", () => {
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let memorySigner;
  /** @type {Awaited<ReturnType<typeof connectMcp>> | undefined} */
  let brokenSigner;
  /** Fresh per run, so no other test's state can explain an assertion. */
  /** @type {string} */
  let RECIPIENT;
  /** @type {string[]} */
  const configDirs = [];

  /** Fresh config dir for one server child, registered for cleanup. */
  const newConfigDir = async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "solos-mcp-transfer-"));
    configDirs.push(dir);
    return dir;
  };

  beforeAll(async () => {
    RECIPIENT = await seedAddress(randomSeed());
    memorySigner = await connectMcp({
      ...solosServerCommand(),
      env: {
        SOLANA_RPC_URL: DEAD_RPC_URL,
        SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
        SOLOS_CONFIG_DIR: await newConfigDir(),
        SOLOS_LOG_LEVEL: "warn",
        SOLOS_TOOL_TIER: "execute",
        SOLOS_TOOLS: "all",
      },
      stderr: "ignore",
    });
    brokenSigner = await connectMcp({
      ...solosServerCommand(),
      env: {
        SOLANA_RPC_URL: DEAD_RPC_URL,
        SOLOS_SIGNER_KEYPAIR_PATH: MISSING_KEYPAIR_PATH,
        SOLOS_CONFIG_DIR: await newConfigDir(),
        SOLOS_LOG_LEVEL: "warn",
        SOLOS_TOOL_TIER: "execute",
        SOLOS_TOOLS: "all",
      },
      stderr: "ignore",
    });
  });

  afterAll(async () => {
    await memorySigner?.close();
    await brokenSigner?.close();
    await Promise.all(configDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  });

  /** @param {Awaited<ReturnType<typeof connectMcp>> | undefined} mcp @param {string | number} amountSol */
  const simulate = (mcp, amountSol) =>
    mcp?.callTool("solana_transfer_simulate_sol", { to: RECIPIENT, amountSol });

  /** The execute twin with simulation skipped: validation must still precede the executor. */
  /** @param {Awaited<ReturnType<typeof connectMcp>> | undefined} mcp @param {string | number} amountSol */
  const send = (mcp, amountSol) =>
    mcp?.callTool("solana_transfer_execute_sol", {
      to: RECIPIENT,
      amountSol,
      skipSimulation: true,
    });

  test('rejects amountSol "0" as a structured ValidationError with no usable provider', async () => {
    const result = await simulate(memorySigner, "0");
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
  });

  test('rejects decimal-zero amountSol "0.000000000" the same way', async () => {
    const result = await simulate(memorySigner, "0.000000000");
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
  });

  test("rejects numeric amountSol 0 as the same structured ValidationError", async () => {
    const result = await simulate(memorySigner, 0);
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({
      code: "ValidationError",
      field: "amountSol",
    });
  });

  test("numeric amountSol 1e-9 fails downstream, never as a parsing defect", async () => {
    const result = await simulate(memorySigner, 1e-9);
    expect(result?.isError).toBe(true);
    const code = result?.structuredContent?.code;
    expect(code).not.toBe("InternalError");
    expect(code).not.toBe("ValidationError");
  });

  test("with a nonexistent keypair, zero-equivalents fail as ValidationError, pre-signer", async () => {
    for (const amountSol of ["0", "0.000000000", 0, 4.9e-10, -1e-9]) {
      const result = await simulate(brokenSigner, amountSol);
      expect(result?.isError).toBe(true);
      expect(result?.structuredContent).toMatchObject({
        code: "ValidationError",
        field: "amountSol",
      });
    }
  });

  test("send rejects zero-equivalents, negatives and sub-lamport pre-signer, never as signer error", async () => {
    for (const amountSol of ["0", 0, "0.000000000", 4.9e-10, -1e-9]) {
      const result = await send(brokenSigner, amountSol);
      expect(result?.isError).toBe(true);
      expect(result?.structuredContent).toMatchObject({
        code: "ValidationError",
        field: "amountSol",
      });
      expect(["SignerUnavailable", "RpcError", "InternalError"]).not.toContain(
        result?.structuredContent?.code,
      );
    }
  });

  test("with a nonexistent keypair, a good amount fails later as SignerUnavailable", async () => {
    const result = await simulate(brokenSigner, "0.25");
    expect(result?.isError).toBe(true);
    expect(result?.structuredContent).toMatchObject({ code: "SignerUnavailable" });
  });
});
