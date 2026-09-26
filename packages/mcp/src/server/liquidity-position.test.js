// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { randomAddress } from "@solos/solana/liquidity/whirlpool-fixture";
import { LIQUIDITY, startLiquidityMcp } from "./liquidity-position-fixture.js";

/**
 * `solana_liquidity_get_position` through the real MCP server child: discovery (the previous
 * thirteen tools unchanged plus one read-tier liquidity tool), funded and zero reads with
 * env forwarding, typed unavailable errors, and a Meteora point read.
 */

/** @type {Awaited<ReturnType<typeof startLiquidityMcp>> | undefined} */
let session;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

describe("solos MCP liquidity position tool through a real server child [integration]", () => {
  test("advertises the liquidity tool read-tier and preserves the previous tool list", async () => {
    session = await startLiquidityMcp();
    const tools = await session.mcp.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("solana_liquidity_get_position");
    // The thirteen tools that existed before this slice are all still advertised.
    for (const previous of [
      "solana_launch_get_curve",
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_perp_execute_onboard_trader",
      "solana_perp_get_onboarding_status",
      "solana_perp_get_position",
      "solana_perp_simulate_onboard_trader",
      "solana_swap_get_quote",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]) {
      expect(names, previous).toContain(previous);
    }
    const tool = tools.find((t) => t.name === "solana_liquidity_get_position");
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(tool?._meta?.["solos/tier"]).toBe("read");
    expect(tool?._meta?.["solos/group"]).toBe("liquidity");
    expect(tool?.inputSchema?.properties?.protocol?.description).toBeTruthy();
    expect(tool?.inputSchema?.properties?.position?.description).toBeTruthy();
    expect(tool?.inputSchema?.properties?.owner?.description).toBeTruthy();
  });

  test("reads a funded position through the real adapter with env forwarding", async () => {
    session = await startLiquidityMcp();
    const result = await session.mcp.callTool("solana_liquidity_get_position", {
      protocol: "orca",
      position: session.funded.position,
      owner: session.owner,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      kind: "lp",
      protocol: "orca",
      position: session.funded.position,
      instrument: session.pool.pool,
      liquidity: LIQUIDITY.toString(),
      tokenA: { mint: session.pool.mintA, decimals: 6 },
      tokenB: { mint: session.pool.mintB, decimals: 9 },
      valueUsd: null,
    });
  });

  test("reads an owned zero-liquidity position as a structured zero, never an error", async () => {
    session = await startLiquidityMcp();
    const result = await session.mcp.callTool("solana_liquidity_get_position", {
      protocol: "orca",
      position: session.empty.position,
      owner: session.owner,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      position: session.empty.position,
      liquidity: "0",
      tokenA: { amount: "0" },
      tokenB: { amount: "0" },
    });
  });

  test("a nonexistent position surfaces LiquidityPositionUnavailable as a tool error", async () => {
    session = await startLiquidityMcp();
    const absent = randomAddress();
    const result = await session.mcp.callTool("solana_liquidity_get_position", {
      protocol: "orca",
      position: absent,
      owner: session.owner,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "LiquidityPositionUnavailable",
      position: absent,
      reason: "no account at the position address",
    });
  });

  test("reads a meteora position through the real adapter", async () => {
    session = await startLiquidityMcp();
    const { randomAddress } = await import("@solos/solana/liquidity/whirlpool-fixture");
    const { seedMeteoraBinArray, seedMeteoraPair, seedMeteoraPosition } = await import(
      "@solos/solana/liquidity/meteora-dlmm-seeds"
    );
    const owner = randomAddress();
    const mintX = randomAddress();
    const mintY = randomAddress();
    const pair = await seedMeteoraPair(session.rpcUrl, { mintX, mintY });
    const position = await seedMeteoraPosition(session.rpcUrl, {
      lbPair: pair,
      owner,
      lowerBinId: 0,
      upperBinId: 0,
      shares: [{ index: 0, share: 4n }],
    });
    await seedMeteoraBinArray(session.rpcUrl, {
      lbPair: pair,
      index: 0,
      bins: [{ binId: 0, amountX: 8n, amountY: 2n, supply: 4n }],
    });
    const result = await session.mcp.callTool("solana_liquidity_get_position", {
      protocol: "meteora",
      position,
      owner,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      kind: "lp",
      protocol: "meteora",
      position,
      instrument: pair,
      liquidity: "4",
      tokenA: { mint: mintX, amount: "8", decimals: 9 },
      tokenB: { mint: mintY, amount: "2", decimals: 6 },
      valueUsd: null,
    });
  });
});
