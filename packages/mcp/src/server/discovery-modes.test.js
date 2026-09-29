// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { toolGroups } from "@solos/core";
import { startDiscoveryMcp } from "./discovery-fixture.js";

/** @type {Array<() => Promise<void>>} */
const closers = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

const start = async () => {
  const server = await startDiscoveryMcp();
  closers.push(server.close);
  return server;
};

/** @param {Awaited<ReturnType<typeof import("@solos/mcp").connectMcp>>["callTool"] extends (...args: any) => Promise<infer R> ? R : never} result */
const body = (result) => /** @type {any} */ (result.structuredContent);

describe("the three search modes over stdio [integration]", () => {
  test("exact names enable the known ones and report the rest unknown", async () => {
    const server = await start();
    const result = await server.search({
      names: ["solana_wallet_get_address", "solana_nope", "solana_wallet_get_address"],
    });
    expect(body(result)).toMatchObject({
      mode: "names",
      matched: 1,
      unknown: ["solana_nope"],
      enabled: ["solana_wallet_get_address"],
      notes: ["1 of the names given is not a tool; see unknown."],
    });
    expect(body(result).matches).toEqual([
      expect.objectContaining({ name: "solana_wallet_get_address", available: true }),
    ]);
    const address = await server.mcp.callTool("solana_wallet_get_address", {});
    expect(address.isError).toBeFalsy();
    expect(body(address).address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    // Asking again enables nothing new.
    const again = await server.search({ names: ["solana_wallet_get_address"] });
    expect(body(again).enabled).toEqual([]);
  });

  test("free text with no gateway key ranks locally, says so, and is capped", async () => {
    const server = await start();
    const result = await server.search({ query: "swap SOL for USDC", limit: 2 });
    expect(body(result)).toMatchObject({ mode: "query", selector: "local" });
    expect(body(result).fallback).toContain("AI_GATEWAY_API_KEY is not set");
    expect(body(result).matches).toHaveLength(2);
    expect(body(result).matched).toBeGreaterThan(2);
    expect(body(result).notes[0]).toMatch(/^Listed 2 of \d+ matching tools\./);
    const names = await server.names();
    for (const name of body(result).enabled) expect(names).toContain(name);
  });

  test("a request nothing covers explains what solOS does cover, naming the groups", async () => {
    const server = await start();
    const result = await server.search({ query: "weather forecast tomorrow" });
    expect(body(result)).toMatchObject({
      matches: [],
      matched: 0,
      enabled: [],
      groups: toolGroups,
    });
    expect(body(result).notes).toEqual([
      `No tool covers this request. solOS covers these groups: ${toolGroups.join(", ")}.`,
    ]);
  });

  test("more than one mode is refused as SelectionInputInvalid", async () => {
    const server = await start();
    const result = await server.search({ query: "swap", group: "swap" });
    expect(result.isError).toBe(true);
    expect(body(result)).toMatchObject({
      code: "SelectionInputInvalid",
      reason: "give exactly one of query, group or names",
    });
  });

  test("an unknown group matches nothing and names the groups", async () => {
    const server = await start();
    const result = await server.search({ group: "staking" });
    expect(body(result).matched).toBe(0);
    expect(body(result).notes[0]).toContain("solOS covers these groups:");
  });
});
