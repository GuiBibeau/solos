// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

const EXECUTE = "solana_transfer_execute_sol";
const SIMULATE = "solana_transfer_simulate_sol";
const READ = "solana_wallet_get_balance";

/** @type {string | undefined} */
let signerKey;
/** @type {string | undefined} */
let emptyConfigDir;

/** @param {{ args?: string[]; env?: Record<string, string> }} [overrides] */
const toolNames = async (overrides = {}) => {
  const base = solosServerCommand();
  const mcp = await connectMcp({
    ...base,
    args: [...(base.args ?? []), ...(overrides.args ?? [])],
    env: {
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_CONFIG_DIR: /** @type {string} */ (emptyConfigDir),
      SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
      SOLOS_LOG_LEVEL: "warn",
      ...overrides.env,
    },
    stderr: "ignore",
  });
  try {
    return (await mcp.listTools()).map((tool) => tool.name);
  } finally {
    await mcp.close();
  }
};

beforeAll(async () => {
  signerKey = await seedToPrivateKeyString(randomSeed());
  emptyConfigDir = await mkdtemp(path.join(tmpdir(), "solos-tier-"));
});

afterAll(async () => {
  await rm(emptyConfigDir ?? "", { recursive: true, force: true });
});

describe("MCP tier ceiling [integration]", () => {
  test("with no configuration the server advertises read and simulate tools, not execute", async () => {
    const names = await toolNames();
    expect(names).toContain(READ);
    expect(names).toContain(SIMULATE);
    expect(names).not.toContain(EXECUTE);
  });

  test("--tier read withholds simulate and execute tools too", async () => {
    const names = await toolNames({ args: ["--tier", "read"] });
    expect(names).toContain(READ);
    expect(names).not.toContain(SIMULATE);
    expect(names).not.toContain(EXECUTE);
  });

  test("--tier execute advertises the execute tools", async () => {
    const names = await toolNames({ args: ["--tier", "execute"] });
    expect(names).toContain(EXECUTE);
  });

  test("SOLOS_TOOL_TIER still works", async () => {
    const names = await toolNames({ env: { SOLOS_TOOL_TIER: "read" } });
    expect(names).not.toContain(SIMULATE);
    expect(names).not.toContain(EXECUTE);
  });

  test("an explicit --tier flag wins over the env var", async () => {
    const names = await toolNames({
      args: ["--tier", "execute"],
      env: { SOLOS_TOOL_TIER: "read" },
    });
    expect(names).toContain(EXECUTE);
  });

  test("a withheld tool is absent from tools/list, not present and failing", async () => {
    const names = await toolNames();
    expect(names).not.toContain(EXECUTE);
    expect(names.length).toBeGreaterThan(0);
  });

  test("a dangling --tier fails startup rather than falling back to a permissive env", async () => {
    await expect(
      toolNames({ args: ["--tier"], env: { SOLOS_TOOL_TIER: "execute" } }),
    ).rejects.toThrow();
  });
});
