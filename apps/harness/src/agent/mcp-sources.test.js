// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { solosServerCommand } from "@solos/mcp";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { discoverMcpTools, externalToolName, MAX_TOOL_NAME_LENGTH } from "./mcp-sources.js";

/** @type {string} */
let configDir;
/** @type {Record<string, string>} */
let env;

beforeAll(async () => {
  configDir = await mkdtemp(path.join(tmpdir(), "solos-mcp-sources-"));
  env = {
    SOLANA_RPC_URL: "http://127.0.0.1:1",
    SOLOS_CONFIG_DIR: configDir,
    SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
    SOLOS_LOG_LEVEL: "warn",
    SOLOS_TOOLS: "all",
  };
});

afterAll(async () => {
  await rm(configDir, { recursive: true, force: true });
});

/** The repo's own server standing in for a third party. */
const twin = () => ({ name: "twin", ...solosServerCommand(), env });

describe("externalToolName", () => {
  test("prefixes with the server name and refuses names a provider would reject", () => {
    expect(externalToolName("twin", "solana_wallet_get_address")).toBe(
      "twin__solana_wallet_get_address",
    );
    const long = "x".repeat(MAX_TOOL_NAME_LENGTH - 4);
    expect(() => externalToolName("srv", long)).toThrow("exceeds 64 characters");
  });
});

describe("third-party MCP discovery [integration]", () => {
  test("connects once, exposes every tool under the server's namespace, and closes", async () => {
    const external = await discoverMcpTools([twin()]);
    try {
      const names = Object.keys(external.tools);
      expect(names.length).toBeGreaterThan(3);
      expect(names.every((name) => name.startsWith("twin__solana_"))).toBe(true);
      expect(names).toContain(externalToolName("twin", "solana_wallet_get_address"));
      expect(external.groups[externalToolName("twin", "solana_wallet_get_address")]).toBe("twin");
      // Namespacing means no external name can ever equal a core tool name.
      expect(names.some((name) => name.startsWith("solana_"))).toBe(false);
    } finally {
      await external.close();
    }
  });

  test("a server that cannot start fails discovery instead of leaving a partial set", async () => {
    await expect(
      discoverMcpTools([
        twin(),
        { name: "broken", command: "solos-no-such-binary", args: [], env: {} },
      ]),
    ).rejects.toThrow();
  });
});
