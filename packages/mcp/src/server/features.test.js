// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

/** @type {string | undefined} */
let signerKey;
/** @type {string | undefined} */
let configDir;

/** @param {{ args?: string[]; env?: Record<string, string> }} [overrides] */
const listed = async (overrides = {}) => {
  const base = solosServerCommand();
  const mcp = await connectMcp({
    ...base,
    args: [...(base.args ?? []), ...(overrides.args ?? [])],
    env: {
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_CONFIG_DIR: /** @type {string} */ (configDir),
      SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
      SOLOS_LOG_LEVEL: "warn",
      SOLOS_TOOLS: "all",
      ...overrides.env,
    },
    stderr: "ignore",
  });
  try {
    return await mcp.listTools();
  } finally {
    await mcp.close();
  }
};

beforeAll(async () => {
  signerKey = await seedToPrivateKeyString(randomSeed());
  configDir = await mkdtemp(path.join(tmpdir(), "solos-features-"));
});

afterAll(async () => {
  await rm(configDir ?? "", { recursive: true, force: true });
});

describe("stability labels over stdio (ADR-0036) [integration]", () => {
  test("every advertised tool carries its label in _meta, and only non-stable descriptions carry the suffix", async () => {
    const tools = await listed();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(["beta", "stable"], tool.name).toContain(tool._meta?.["solos/stability"]);
    }
    const stable = tools.find((tool) => tool.name === "solana_transfer_simulate_sol");
    const beta = tools.find((tool) => tool.name === "solana_wallet_get_balance");
    expect(stable?._meta?.["solos/stability"]).toBe("stable");
    expect(stable?.description?.endsWith(" (beta)")).toBe(false);
    expect(beta?._meta?.["solos/stability"]).toBe("beta");
    expect(beta?.description?.endsWith(" (beta)")).toBe(true);
  });

  test("--features experimental and SOLOS_FEATURES are accepted; the registry ships no experimental tool today", async () => {
    const plain = (await listed()).map((tool) => tool.name);
    const flagged = (await listed({ args: ["--features", "experimental"] })).map((t) => t.name);
    const fromEnv = (await listed({ env: { SOLOS_FEATURES: "experimental" } })).map((t) => t.name);
    expect(flagged).toEqual(plain);
    expect(fromEnv).toEqual(plain);
  });

  test("an unknown feature fails startup rather than being ignored", async () => {
    await expect(listed({ args: ["--features", "bogus"] })).rejects.toThrow();
  });
});
