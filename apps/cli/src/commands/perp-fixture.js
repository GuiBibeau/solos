// @ts-check
import { randomSeed, seedAddress, seedToPrivateKeyString } from "@solos/solana/surfnet";
/**
 * Shared harness for the `solos perp position` command tests: the documented trader-state body
 * the loopback Phoenix fixture serves, the fixture server itself, and per-process signer envs.
 */

/** The System Program stands in for a fixture trader authority. */
export const OWNER = "So11111111111111111111111111111111111111112";
export const MARKET_CONFIG = { symbol: "SOL", baseLotsDecimals: 2, tickSize: 100 };

function positionRow() {
  return {
    symbol: "SOL",
    positionSequenceNumber: "1",
    basePositionLots: "1500",
    entryPriceTicks: "15000",
    virtualQuotePositionLots: "0",
    unsettledFundingQuoteLots: "0",
    accumulatedFundingQuoteLots: "0",
  };
}

/** Documented trader-state body: one open long, 1500 lots at 2 decimals = 15 SOL.
 * @param {string} authority
 */
const traderState = (authority) => ({
  authority,
  traderPdaIndex: 0,
  slot: 448_348_464,
  slotIndex: 1355,
  snapshot: {
    version: 1,
    capabilities: { flags: 62, state: "active", capabilities: {} },
    makerFeeOverrideMultiplier: 1,
    takerFeeOverrideMultiplier: 1,
    subaccounts: [
      { subaccountIndex: 0, sequence: 0, collateral: "500000000", positions: [positionRow()] },
    ],
  },
});

/**
 * Loopback Phoenix Perps fixture: serves the SOL market config and one trader state for every
 * authority; everything else is a 404 the CLI must map to `PerpMarketUnknown`. Every request
 * is recorded so tests can pin the exact outbound calls.
 * @returns {{ requests: Array<{ path: string; query: Record<string, string> }>; url: string; stop: () => void }}
 */
export const startPerpFixture = () => {
  const requests = /** @type {Array<{ path: string; query: Record<string, string> }>} */ ([]);
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (url.pathname === "/v1/view/exchange/market/SOL") return Response.json(MARKET_CONFIG);
      if (url.pathname.startsWith("/v1/trader/state/")) {
        const authority = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
        return Response.json(traderState(authority));
      }
      return Response.json({ error: `Market 'DOGE' not found` }, { status: 404 });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/**
 * Fresh disposable signer per process, so the default-owner assertion is airtight.
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 * @param {string} fixtureUrl
 * @returns {Promise<{ seed: Uint8Array; address: string; env: Record<string, string> }>}
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
