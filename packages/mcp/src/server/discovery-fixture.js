// @ts-check
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";
import { SEARCH_TOOL } from "./discovery.js";

/**
 * One real stdio server that needs no chain: a dead RPC, a throwaway signer, no saved profiles
 * and no gateway key, so free-text searches fall back to the local matcher. Discovery is on
 * unless `args` or `env` say otherwise.
 * @param {{ args?: string[]; env?: Record<string, string> }} [overrides]
 */
export const startDiscoveryMcp = async (overrides = {}) => {
  const configDir = await mkdtemp(path.join(tmpdir(), "solos-discovery-"));
  const base = solosServerCommand();
  /** Every re-fetched tool list the client saw after a `tools/list_changed`. @type {string[][]} */
  const changes = [];
  const mcp = await connectMcp({
    ...base,
    args: [...(base.args ?? []), ...(overrides.args ?? [])],
    env: {
      SOLANA_RPC_URL: "http://127.0.0.1:1",
      SOLOS_CONFIG_DIR: configDir,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
      ...overrides.env,
    },
    stderr: "ignore",
    onToolListChanged: (tools) => {
      changes.push(tools.map((tool) => tool.name));
    },
  });
  return {
    mcp,
    changes,
    /** The advertised tool names, sorted. */
    names: async () =>
      (await mcp.listTools()).map((tool) => tool.name).toSorted((a, b) => a.localeCompare(b)),
    /** @param {Record<string, unknown>} args */
    search: (args) => mcp.callTool(SEARCH_TOOL, args),
    close: async () => {
      await mcp.close();
      await rm(configDir, { recursive: true, force: true });
    },
  };
};

/**
 * Wait, bounded, for a condition the server reaches asynchronously (list-changed refreshes).
 * @param {() => boolean} done
 * @param {number} [deadlineMs]
 */
export const until = async (done, deadlineMs = 5000) => {
  const deadline = Date.now() + deadlineMs;
  while (!done() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return done();
};
