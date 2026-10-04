// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { connectMcp } from "@solos/mcp";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { CLI_ENTRY, runSolos, stderrJson } from "./cli-fixture.js";

/** @type {string} */
let configDir = "";
/** @type {string} */
let signerKey = "";

beforeAll(async () => {
  configDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-serve-"));
  signerKey = await seedToPrivateKeyString(randomSeed());
});

afterAll(async () => {
  await rm(configDir, { recursive: true, force: true });
});

/** The env an installed client config would hand the server: no profile, explicit signer and RPC. */
const serverEnv = () => ({
  SOLOS_CONFIG_DIR: configDir,
  SOLANA_RPC_URL: "http://127.0.0.1:1",
  SOLOS_SIGNER_PRIVATE_KEY: signerKey,
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * Connect to `solos mcp serve` the way an MCP client does, through the CLI entry.
 * @param {string[]} flags
 */
const connectServe = (flags) =>
  connectMcp({
    command: process.execPath,
    args: ["--no-env-file", "run", CLI_ENTRY, "mcp", "serve", ...flags],
    env: serverEnv(),
    stderr: "ignore",
  });

describe("solos mcp serve is the MCP server inside the CLI [integration]", () => {
  test("serves the solos tools over stdio and withholds execute tools by default", async () => {
    const mcp = await connectServe(["--tools", "all"]);
    try {
      expect(mcp.serverInfo?.name).toBe("solos");
      const names = (await mcp.listTools()).map((tool) => tool.name);
      expect(names).toContain("solana_wallet_get_balance");
      expect(names).toContain("solana_swap_simulate_swap");
      expect(names.some((name) => name.includes("_execute_"))).toBe(false);
    } finally {
      await mcp.close();
    }
  });

  test("--tier read lowers the ceiling to reads only", async () => {
    const mcp = await connectServe(["--tier", "read", "--tools", "all"]);
    try {
      const names = (await mcp.listTools()).map((tool) => tool.name);
      expect(names).toContain("solana_wallet_get_balance");
      expect(names.some((name) => name.includes("_simulate_"))).toBe(false);
    } finally {
      await mcp.close();
    }
  });

  test("without an RPC URL or signer it exits 1 with the error envelope, never a stack", async () => {
    const { stdout, stderr, code } = await runSolos(["mcp", "serve"], {
      SOLOS_CONFIG_DIR: configDir,
    });
    expect(code).toBe(1);
    expect(stdout).toBe("");
    const envelope = stderrJson(stderr);
    expect(["RpcConfigMissing", "SignerConfigMissing"]).toContain(envelope?.error?.code);
    expect(envelope?.error?.remedy).toContain("solos login");
    expect(stderr).not.toContain("    at ");
  });
});
