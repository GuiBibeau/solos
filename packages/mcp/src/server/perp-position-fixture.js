// @ts-check
import { startPhoenixFixture } from "@solos/solana/perp/phoenix-fixture";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

/**
 * One loopback Phoenix fixture plus one real stdio MCP child per test. Reads need no
 * credential; `PHOENIX_BASE_URL` is the only override, matching the CLI harness.
 */

/** @param {{ rpcUrl: string; wsUrl: string }} surfnet */
const baseEnv = async (surfnet) => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 * @param {import("@solos/solana/perp/phoenix-fixture").PhoenixScript} [script]
 * @param {{ phoenix?: boolean }} [options] `phoenix: false` omits `PHOENIX_BASE_URL`
 */
export const startPerpMcp = async (surfnet, script = {}, options = {}) => {
  const fixture = startPhoenixFixture(script);
  /** @type {Record<string, string>} */
  const env = await baseEnv(surfnet);
  env.SOLOS_TOOL_TIER = "execute";
  if (options.phoenix !== false) env.PHOENIX_BASE_URL = fixture.url;
  const mcp = await connectMcp({
    ...solosServerCommand(),
    env,
    stderr: "ignore",
  });
  return {
    fixture,
    mcp,
    close: async () => {
      await mcp.close();
      fixture.stop();
    },
  };
};
