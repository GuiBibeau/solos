// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { runSolos } from "./cli-fixture.js";

/** @type {Record<string, string>} */
let env;
/** @type {string} */
let configDir;

beforeAll(async () => {
  configDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-discovery-"));
  env = {
    SOLANA_RPC_URL: "http://127.0.0.1:1",
    SOLOS_CONFIG_DIR: configDir,
    SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
    SOLOS_LOG_LEVEL: "warn",
  };
});

afterAll(async () => {
  await rm(configDir, { recursive: true, force: true });
});

describe("`solos mcp` as a Caller under just-in-time discovery [integration]", () => {
  test("`mcp list` shows the bootstrap tools and the catalogue in the instructions", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], env);
    expect(code).toBe(0);
    const listed = JSON.parse(stdout);
    expect(listed.tools.map((/** @type {{ name: string }} */ t) => t.name)).toEqual([
      "solana_discovery_search_tools",
      "solana_portfolio_get_state",
      "solana_wallet_get_balance",
    ]);
    expect(listed.instructions).toContain("solana_swap_get_quote — ");
  });

  test("`mcp call` on a withheld tool discovers it by name first, then calls it", async () => {
    const { stdout, code } = await runSolos(["mcp", "call", "solana_wallet_get_address"], env);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  });

  test("`mcp call` on a tool above the ceiling returns the search result that says why", async () => {
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_transfer_execute_sol", "--args", '{"to":"x","amountSol":"1"}'],
      env,
    );
    expect(code).toBe(1);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent.matches).toEqual([
      expect.objectContaining({ name: "solana_transfer_execute_sol", available: false }),
    ]);
    expect(result.structuredContent.notes.join(" ")).toContain("--tier execute");
  });

  test("SOLOS_TOOLS=all is forwarded, so every permitted tool is listed without a search", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], { ...env, SOLOS_TOOLS: "all" });
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toContain("solana_wallet_get_address");
    expect(names).toContain("solana_transfer_simulate_sol");
    expect(names).not.toContain("solana_transfer_execute_sol");
  });
});
