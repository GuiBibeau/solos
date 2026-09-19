// @ts-check
import { startPhoenixFixture } from "@solos/solana/perp/phoenix-fixture";
import { longState } from "@solos/solana/perp/phoenix-scenarios";
import { randomSeed, seedAddress, seedToPrivateKeyString } from "@solos/solana/surfnet";

/**
 * Shared harness for `solos perp position` child-process tests: the loopback Phoenix fixture
 * (same canned bodies as the adapter suite) plus a disposable signer env.
 */

/** The System Program stands in for a fixture trader authority. */
export const OWNER = "11111111111111111111111111111111";

/**
 * Loopback Phoenix fixture. Default script is one long on SOL for every authority, matching
 * the original CLI happy-path body. Pass a script to cover short/flat/cold/multi-market.
 * @param {import("@solos/solana/perp/phoenix-fixture").PhoenixScript} [script]
 */
export const startPerpFixture = (script) =>
  startPhoenixFixture(
    script ?? { trader: (/** @type {string} */ authority) => longState(authority) },
  );

/**
 * Fresh disposable signer per process, so the default-owner assertion is airtight.
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 * @param {string} fixtureUrl
 */
export const signerEnv = async (surfnet, fixtureUrl) => {
  const seed = randomSeed();
  return {
    seed,
    address: await seedAddress(seed),
    env: {
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(seed),
      SOLOS_LOG_LEVEL: "warn",
      PHOENIX_BASE_URL: fixtureUrl,
    },
  };
};
