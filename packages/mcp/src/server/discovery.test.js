// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { allTools } from "@solos/core";
import { startDiscoveryMcp, until } from "./discovery-fixture.js";
import { filterByTier } from "./register-tools.js";

const SEARCH = "solana_discovery_search_tools";
const BOOTSTRAP = [SEARCH, "solana_portfolio_get_state", "solana_wallet_get_balance"];

/** @type {Array<() => Promise<void>>} */
const closers = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

/** @param {Parameters<typeof startDiscoveryMcp>[0]} [overrides] */
const start = async (overrides) => {
  const server = await startDiscoveryMcp(overrides);
  closers.push(server.close);
  return server;
};

describe("just-in-time tool discovery over stdio [integration]", () => {
  test("a fresh server advertises the search tool and the always-useful reads, nothing else", async () => {
    const server = await start();
    expect(await server.names()).toEqual(BOOTSTRAP);
  });

  test("the instructions carry the whole catalogue and mark tools above the ceiling", async () => {
    const server = await start();
    const instructions = server.mcp.instructions ?? "";
    for (const tool of allTools) expect(instructions).toContain(`${tool.name} — ${tool.title}`);
    expect(instructions).toContain("- wallet:");
    expect(instructions).toContain(`Most tools are withheld until asked for. Call ${SEARCH}`);
    expect(instructions).toContain(
      "solana_transfer_execute_sol — Send SOL (unavailable: above the simulate ceiling)",
    );
    expect(instructions).not.toContain(
      "solana_transfer_simulate_sol — Simulate a SOL transfer (unavailable",
    );
  });

  test("a group search enables its tools within the ceiling, with schema and annotations, and names the rest as unavailable", async () => {
    const server = await start();
    const result = await server.search({ group: "transfer" });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      mode: "group",
      matched: 2,
      ceiling: "simulate",
      enabled: ["solana_transfer_simulate_sol"],
    });
    const matches = /** @type {any} */ (result.structuredContent).matches;
    expect(matches.map((/** @type {any} */ m) => [m.name, m.tier, m.available])).toEqual([
      ["solana_transfer_execute_sol", "execute", false],
      ["solana_transfer_simulate_sol", "simulate", true],
    ]);
    expect(/** @type {any} */ (result.structuredContent).notes).toEqual([
      "1 matching tool exist above this server's tier ceiling (simulate) and cannot be called here. Ask the Operator to start the server with --tier execute.",
    ]);
    const names = await server.names();
    expect(names).toContain("solana_transfer_simulate_sol");
    expect(names).not.toContain("solana_transfer_execute_sol");
    const simulate = (await server.mcp.listTools()).find(
      (tool) => tool.name === "solana_transfer_simulate_sol",
    );
    expect(simulate?.inputSchema.properties?.to).toMatchObject({ description: expect.any(String) });
    expect(simulate?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(simulate?._meta?.["solos/tier"]).toBe("simulate");
    // The client learned about it from tools/list_changed, not only from asking again.
    expect(
      await until(() =>
        server.changes.some((list) => list.includes("solana_transfer_simulate_sol")),
      ),
    ).toBe(true);
  });

  test("a withheld tool cannot be called before it is discovered", async () => {
    const server = await start();
    await expect(server.mcp.callTool("solana_wallet_get_address", {})).rejects.toThrow(/disabled/);
  });

  test("--tools all advertises every tool the ceiling permits and says so", async () => {
    const server = await start({ args: ["--tools", "all"] });
    expect(await server.names()).toEqual(
      filterByTier(allTools, "simulate")
        .map((tool) => tool.name)
        .toSorted((a, b) => a.localeCompare(b)),
    );
    expect(server.mcp.instructions).toContain(
      "Every tool the tier ceiling permits is advertised up front.",
    );
  });

  test("SOLOS_TOOLS=all does the same, and the flag wins over it", async () => {
    const byEnv = await start({ env: { SOLOS_TOOLS: "all" } });
    expect((await byEnv.names()).length).toBeGreaterThan(BOOTSTRAP.length);
    const byFlag = await start({ args: ["--tools", "discover"], env: { SOLOS_TOOLS: "all" } });
    expect(await byFlag.names()).toEqual(BOOTSTRAP);
  });

  test("a dangling --tools fails startup rather than falling back to the env", async () => {
    await expect(start({ args: ["--tools"], env: { SOLOS_TOOLS: "all" } })).rejects.toThrow();
  });
});
