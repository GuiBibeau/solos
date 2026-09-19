// @ts-check
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { OTHER_AUTHORITY, shortState } from "@solos/solana/perp/phoenix-scenarios";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { startPerpMcp } from "./perp-position-fixture.js";

/**
 * `solana_perp_get_position` through the real MCP server child: discovery, a short success
 * mirror, and unknown-market failure. Flat/absent/multi-market live in the sibling suite.
 */

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof startPerpMcp>> | undefined} */
let session;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
});

afterEach(async () => {
  await session?.close();
  session = undefined;
});

describe("solos MCP perp position tool through a real server child [integration]", () => {
  test("advertises the perp tool as a read-tier perp tool with described arguments", async () => {
    session = await startPerpMcp(surfnet, { trader: shortState() });
    const tools = await session.mcp.listTools();
    const perp = tools.find((t) => t.name === "solana_perp_get_position");
    expect(perp?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(perp?._meta?.["solos/tier"]).toBe("read");
    expect(perp?._meta?.["solos/group"]).toBe("perp");
    expect(perp?.inputSchema?.properties?.market?.description).toBeTruthy();
    expect(perp?.inputSchema?.properties?.owner?.description).toBeTruthy();
  });

  test("the tool is advertised with zero perp env, because reads need no credential", async () => {
    session = await startPerpMcp(surfnet, {}, { phoenix: false });
    const tools = await session.mcp.listTools();
    expect(tools.map((t) => t.name)).toContain("solana_perp_get_position");
  });

  test("reads a short position through the real HTTP adapter with env forwarding", async () => {
    session = await startPerpMcp(surfnet, { trader: (authority) => shortState(authority) });
    const before = session.fixture.requests.length;
    const result = await session.mcp.callTool("solana_perp_get_position", {
      market: "SOL-PERP",
      owner: OTHER_AUTHORITY,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.position).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: OTHER_AUTHORITY,
      instrument: "SOL",
      side: "short",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(result.structuredContent?.account).toMatchObject({
      protocol: "phoenix",
      account: OTHER_AUTHORITY,
      equityUsd: null,
    });
    const seen = session.fixture.requests.slice(before);
    expect(seen.some((entry) => entry.path === "/v1/view/exchange/market/SOL")).toBe(true);
    expect(seen.some((entry) => entry.query.traderPdaIndex === "0")).toBe(true);
  });

  test("an unknown market surfaces PerpMarketUnknown as a tool error", async () => {
    session = await startPerpMcp(surfnet, { trader: shortState() });
    const before = session.fixture.requests.length;
    const result = await session.mcp.callTool("solana_perp_get_position", {
      market: "DOGE",
      owner: OTHER_AUTHORITY,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "PerpMarketUnknown", market: "DOGE" });
    expect(session.fixture.requests.slice(before)).toHaveLength(1);
  });
});
