// @ts-check
import {
  randomAddress,
  seedWhirlpool,
  seedWhirlpoolPosition,
  SQRT_PRICE_ONE,
} from "@solos/solana/liquidity/whirlpool-fixture";
import {
  ensureOfflineSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";

/**
 * Shared harness for `solos liquidity position` child-process tests: the seeded offline
 * Surfnet Whirlpool family plus a disposable signer env per process.
 */

/** Funding liquidity for the funded CLI fixture. */
export const LIQUIDITY = 10n ** 12n;

/**
 * Seed one pool and its funded/empty/foreign positions on the running Surfnet.
 * @returns {Promise<{
 *   rpcUrl: string;
 *   pool: { pool: string; mintA: string; mintB: string };
 *   funded: { position: string; positionMint: string };
 *   empty: { position: string; positionMint: string };
 *   owner: string;
 * }>}
 */
export const seedLiquidityCliFixtures = async () => {
  const surfnet = await ensureOfflineSurfnet();
  const owner = randomAddress();
  const pool = await seedWhirlpool(surfnet.rpcUrl, { sqrtPrice: SQRT_PRICE_ONE });
  const funded = await seedWhirlpoolPosition(surfnet.rpcUrl, {
    pool: pool.pool,
    owner,
    liquidity: LIQUIDITY,
  });
  const empty = await seedWhirlpoolPosition(surfnet.rpcUrl, { pool: pool.pool, owner });
  return { rpcUrl: surfnet.rpcUrl, pool, funded, empty, owner };
};

/**
 * Fresh disposable signer per child process, so the default-owner assertion is airtight.
 * @param {{ rpcUrl: string }} surfnet
 */
export const signerEnv = async (surfnet) => {
  const seed = randomSeed();
  return {
    seed,
    address: await seedAddress(seed),
    env: {
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
      SOLOS_LOG_LEVEL: "warn",
      SOLOS_TOOL_TIER: "execute",
      SOLOS_TOOLS: "all",
    },
  };
};

/** A dead RPC URL: connections are refused instantly, proving no request was needed. */
export const DEAD_RPC_URL = "http://127.0.0.1:1";
