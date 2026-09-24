// @ts-check
import { afterEach, beforeAll, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { startPerpMcp } from "./perp-position-fixture.js";

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

test("Phoenix reduce-only close twins [integration] are listed and fail closed over real stdio MCP", async () => {
  session = await startPerpMcp(surfnet, { traderStatus: 404 });
  const tools = await session.mcp.listTools();
  for (const [name, tier] of [
    ["solana_perp_simulate_close", "simulate"],
    ["solana_perp_execute_close", "execute"],
  ]) {
    const tool = tools.find((entry) => entry.name === name);
    expect(tool?._meta?.["solos/tier"]).toBe(tier);
    expect(tool?.inputSchema?.properties?.limitPriceUsd?.description).toBeTruthy();
    const response = await session.mcp.callTool(name, { market: "SOL", limitPriceUsd: "150.25" });
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({ code: "BuildRejected" });
  }
});
