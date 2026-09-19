// @ts-check
import {
  randomAddress,
  seedWhirlpool,
  seedWhirlpoolPosition,
  SQRT_PRICE_ONE,
} from "@solos/solana/liquidity/whirlpool-fixture";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

/**
 * One seeded offline Surfnet Whirlpool family plus one real stdio MCP child per test. Reads
 * need no credential; `SOLANA_RPC_URL` is forwarded, matching the CLI harness.
 */

/** Funding liquidity for the funded MCP fixture. */
export const LIQUIDITY = 10n ** 12n;

/**
 * Seed the Surfnet and start one MCP child over it.
 * @param {{ rpcUrl?: string }} [options] `rpcUrl` overrides the forwarded RPC (dead-URL proofs)
 * @returns {Promise<{
 *   mcp: Awaited<ReturnType<typeof connectMcp>>;
 *   owner: string;
 *   pool: { pool: string; mintA: string; mintB: string };
 *   funded: { position: string; positionMint: string };
 *   empty: { position: string; positionMint: string };
 *   close: () => Promise<void>;
 * }>}
 */
export const startLiquidityMcp = async (options = {}) => {
  const surfnet = await ensureSurfnet();
  const owner = randomAddress();
  const pool = await seedWhirlpool(surfnet.rpcUrl, { sqrtPrice: SQRT_PRICE_ONE });
  const funded = await seedWhirlpoolPosition(surfnet.rpcUrl, {
    pool: pool.pool,
    owner,
    liquidity: LIQUIDITY,
  });
  const empty = await seedWhirlpoolPosition(surfnet.rpcUrl, { pool: pool.pool, owner });
  const mcp = await connectMcp({
    ...solosServerCommand(),
    env: {
      SOLANA_RPC_URL: options.rpcUrl ?? surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
    },
    stderr: "ignore",
  });
  return {
    mcp,
    owner,
    pool,
    funded,
    empty,
    close: () => mcp.close(),
  };
};
