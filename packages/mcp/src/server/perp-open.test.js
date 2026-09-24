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

const input = {
  market: "SOL",
  side: "long",
  notionalUsd: "1000000",
  maxLeverage: 2,
  limitPriceUsd: "150.25",
};

test("Phoenix IOC open twins [integration] are listed and reject an unregistered signer over real stdio MCP", async () => {
  session = await startPerpMcp(surfnet, { traderStatus: 404 });
  const tools = await session.mcp.listTools();
  for (const [name, tier] of [
    ["solana_perp_simulate_open", "simulate"],
    ["solana_perp_execute_open", "execute"],
  ]) {
    const tool = tools.find((entry) => entry.name === name);
    expect(tool?._meta?.["solos/tier"]).toBe(tier);
    expect(tool?.inputSchema?.properties?.limitPriceUsd?.description).toBeTruthy();
    const response = await session.mcp.callTool(name, input);
    expect(response.isError).toBe(true);
    expect(response.structuredContent).toMatchObject({ code: "BuildRejected" });
  }
  expect(session.fixture.requests).toHaveLength(2);
  expect(session.fixture.requests.every(({ path }) => path.startsWith("/v1/trader/state/"))).toBe(
    true,
  );
});
