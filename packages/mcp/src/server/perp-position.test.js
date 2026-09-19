// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { connectMcp, solosServerCommand } from "../client/index.js";

const OWNER = "11111111111111111111111111111111";
const MARKET_CONFIG = { symbol: "SOL", baseLotsDecimals: 2, tickSize: 100 };

/** Documented trader-state body: one open short, -1500 lots at 2 decimals = 15 SOL short. */
const traderState = (authority) => ({
  authority,
  traderPdaIndex: 0,
  slot: 448348464,
  slotIndex: 1355,
  snapshot: {
    version: 1,
    capabilities: { flags: 62, state: "active", capabilities: {} },
    makerFeeOverrideMultiplier: 1,
    takerFeeOverrideMultiplier: 1,
    subaccounts: [
      {
        subaccountIndex: 0,
        sequence: 0,
        collateral: "500000000",
        positions: [
          {
            symbol: "SOL",
            positionSequenceNumber: "1",
            basePositionLots: "-1500",
            entryPriceTicks: "15000",
            virtualQuotePositionLots: "0",
            unsettledFundingQuoteLots: "0",
            accumulatedFundingQuoteLots: "0",
          },
        ],
      },
    ],
  },
});

describe("solos MCP perp position tool through a real server child [integration]", () => {
  /** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
  let surfnet;
  /** @type {{ requests: Array<{ path: string; query: Record<string, string> }>; url: string; stop: () => void }} */
  let fixture;
  /** @type {Awaited<ReturnType<typeof connectMcp>>} */
  let withFixture;
  /** @type {Awaited<ReturnType<typeof connectMcp>>} */
  let withoutPerpEnv;

  beforeAll(async () => {
    surfnet = await ensureSurfnet();
    const requests = [];
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
    fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
    const baseEnv = {
      SOLANA_RPC_URL: surfnet.rpcUrl,
      SOLANA_WS_URL: surfnet.wsUrl,
      SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
      SOLOS_LOG_LEVEL: "warn",
    };
    withFixture = await connectMcp({
      ...solosServerCommand(),
      env: { ...baseEnv, PHOENIX_BASE_URL: fixture.url },
      stderr: "ignore",
    });
    withoutPerpEnv = await connectMcp({
      ...solosServerCommand(),
      env: baseEnv,
      stderr: "ignore",
    });
  });

  afterAll(async () => {
    await withFixture?.close();
    await withoutPerpEnv?.close();
    fixture?.stop();
  });

  test("advertises the perp tool as a read-tier perp tool with described arguments", async () => {
    const tools = await withFixture.listTools();
    const perp = tools.find((t) => t.name === "solana_perp_get_position");
    expect(perp?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(perp?._meta?.["solos/tier"]).toBe("read");
    expect(perp?._meta?.["solos/group"]).toBe("perp");
    expect(perp?.inputSchema?.properties?.market?.description).toBeTruthy();
    expect(perp?.inputSchema?.properties?.owner?.description).toBeTruthy();
  });

  test("the tool is advertised with zero perp env, because reads need no credential", async () => {
    const tools = await withoutPerpEnv.listTools();
    expect(tools.map((t) => t.name)).toContain("solana_perp_get_position");
  });

  test("reads a short position through the real HTTP adapter with env forwarding", async () => {
    const before = fixture.requests.length;
    const result = await withFixture.callTool("solana_perp_get_position", {
      market: "SOL-PERP",
      owner: OWNER,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.position).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: OWNER,
      instrument: "SOL",
      side: "short",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(result.structuredContent?.account).toMatchObject({
      protocol: "phoenix",
      account: OWNER,
      equityUsd: null,
    });
    const seen = fixture.requests.slice(before);
    expect(seen.some((entry) => entry.path === "/v1/view/exchange/market/SOL")).toBe(true);
    expect(seen.some((entry) => entry.query.traderPdaIndex === "0")).toBe(true);
  });

  test("an unknown market surfaces PerpMarketUnknown as a tool error", async () => {
    const before = fixture.requests.length;
    const result = await withFixture.callTool("solana_perp_get_position", {
      market: "DOGE",
      owner: OWNER,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "PerpMarketUnknown", market: "DOGE" });
    expect(fixture.requests.slice(before)).toHaveLength(1);
  });
});
