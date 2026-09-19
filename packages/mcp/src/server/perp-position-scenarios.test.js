// @ts-check
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTHORITY,
  OTHER_AUTHORITY,
  coldState,
  flatState,
  multiMarketState,
} from "@solos/solana/perp/phoenix-scenarios";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { startPerpMcp } from "./perp-position-fixture.js";

/**
 * MCP child-process mirrors of the adapter suite's flat, absent-trader, and multi-market
 * reads. Short, discovery, and unknown-market stay in `perp-position.test.js`.
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

describe("solos MCP perp position scenarios through a real server child [integration]", () => {
  test("an active but flat trader is a typed flat position with exact collateral equity", async () => {
    session = await startPerpMcp(surfnet, { trader: flatState() });
    const result = await session.mcp.callTool("solana_perp_get_position", {
      market: "SOL",
      owner: DEFAULT_AUTHORITY,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.position).toMatchObject({ side: "flat", amount: "0" });
    expect(result.structuredContent?.account).toMatchObject({
      account: DEFAULT_AUTHORITY,
      equityUsd: "250",
    });
  });

  test("a valid market with no registered trader is zero-position success, not an error", async () => {
    session = await startPerpMcp(surfnet, { trader: (authority) => coldState(authority) });
    const result = await session.mcp.callTool("solana_perp_get_position", {
      market: "SOL",
      owner: OTHER_AUTHORITY,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.position).toMatchObject({
      account: OTHER_AUTHORITY,
      side: "flat",
      amount: "0",
    });
    expect(result.structuredContent?.account).toMatchObject({
      account: OTHER_AUTHORITY,
      equityUsd: "0",
    });
  });

  test("a multi-market account reads the requested market without mixing the other", async () => {
    session = await startPerpMcp(surfnet, { trader: multiMarketState() });
    const result = await session.mcp.callTool("solana_perp_get_position", {
      market: "ETH",
      owner: DEFAULT_AUTHORITY,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.position).toMatchObject({
      instrument: "ETH",
      side: "short",
      amount: "1000",
      decimals: 3,
    });
  });
});
