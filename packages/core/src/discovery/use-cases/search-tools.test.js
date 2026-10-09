// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { localMatches } from "../domain/local-match.js";
import { ToolCatalogue } from "../ports/tool-catalogue.js";
import { ToolSelector } from "../ports/tool-selector.js";
import { searchTools } from "./search-tools.js";

/** A small catalogue in the real naming scheme, every tier represented. */
const TOOLS = [
  {
    name: "solana_swap_execute_swap",
    group: "swap",
    title: "Execute a Jupiter swap",
    description: "Swap tokens through Jupiter and wait for confirmation.",
    tier: /** @type {const} */ ("execute"),
    stability: /** @type {const} */ ("beta"),
  },
  {
    name: "solana_swap_get_quote",
    group: "swap",
    title: "Get a swap quote",
    description: "An indicative Jupiter quote; nothing is sent.",
    tier: /** @type {const} */ ("read"),
    stability: /** @type {const} */ ("beta"),
  },
  {
    name: "solana_swap_simulate_swap",
    group: "swap",
    title: "Simulate a Jupiter swap",
    description: "Build and simulate a swap; nothing is sent.",
    tier: /** @type {const} */ ("simulate"),
    stability: /** @type {const} */ ("beta"),
  },
  {
    name: "solana_wallet_get_balance",
    group: "wallet",
    title: "Get wallet balance",
    description: "SOL and token balances of one wallet.",
    tier: /** @type {const} */ ("read"),
    stability: /** @type {const} */ ("beta"),
  },
];

/** An experimental tool, so the feature flag has something to withhold. */
const EXPERIMENTAL = {
  name: "solana_swap_simulate_route",
  group: "swap",
  title: "Simulate a routed swap",
  description: "Preview a swap across several venues; nothing is sent.",
  tier: /** @type {const} */ ("simulate"),
  stability: /** @type {const} */ ("experimental"),
};

/** @typedef {{ tools?: typeof TOOLS; experimental?: boolean }} Extra */

/** @param {"read" | "simulate" | "execute"} ceiling @param {Extra} [extra] */
const env = (ceiling, extra = {}) =>
  Layer.merge(
    Layer.succeed(ToolCatalogue, {
      tools: extra.tools ?? TOOLS,
      ceiling,
      experimental: extra.experimental ?? false,
    }),
    Layer.succeed(ToolSelector, {
      name: "local",
      select: ({ query, tools }) => Effect.succeed(localMatches(query, tools)),
    }),
  );

/**
 * @param {Parameters<typeof searchTools>[0]} input
 * @param {"read" | "simulate" | "execute"} [ceiling]
 * @param {Extra} [extra]
 */
const search = (input, ceiling = "simulate", extra = {}) =>
  Effect.runPromise(searchTools({ limit: 8, ...input }).pipe(Effect.provide(env(ceiling, extra))));

const WITH_EXPERIMENTAL = [...TOOLS, EXPERIMENTAL];

describe("searchTools", () => {
  test("an experimental tool is named, unavailable, and the note says how to enable it (ADR-0036)", async () => {
    const withheld = await search({ names: [EXPERIMENTAL.name] }, "simulate", {
      tools: WITH_EXPERIMENTAL,
    });
    expect(withheld.matches).toEqual([{ ...EXPERIMENTAL, available: false }]);
    expect(withheld.notes).toEqual([
      "1 matching tool is experimental and not enabled on this server. Ask the Operator to start the server with --features experimental.",
    ]);
    const enabled = await search({ names: [EXPERIMENTAL.name] }, "simulate", {
      tools: WITH_EXPERIMENTAL,
      experimental: true,
    });
    expect(enabled.matches[0]?.available).toBe(true);
    expect(enabled.notes).toEqual([]);
  });

  test("a tool both above the ceiling and experimental is counted under both gates", async () => {
    const both = await search({ names: [EXPERIMENTAL.name] }, "read", { tools: WITH_EXPERIMENTAL });
    expect(both.matches[0]?.available).toBe(false);
    expect(both.notes).toEqual([
      "1 matching tool exists above this server's tier ceiling (read) and cannot be called here. Ask the Operator to start the server with --tier simulate.",
      "1 matching tool is experimental and not enabled on this server. Ask the Operator to start the server with --features experimental.",
    ]);
  });

  test("a group lists every tool in it and marks the ones above the ceiling unavailable", async () => {
    const result = await search({ group: "swap" });
    expect(result.mode).toBe("group");
    expect(result.matches.map((m) => [m.name, m.available])).toEqual([
      ["solana_swap_execute_swap", false],
      ["solana_swap_get_quote", true],
      ["solana_swap_simulate_swap", true],
    ]);
    expect(result.matched).toBe(3);
    expect(result.ceiling).toBe("simulate");
    expect(result.notes).toEqual([
      "1 matching tool exists above this server's tier ceiling (simulate) and cannot be called here. Ask the Operator to start the server with --tier execute.",
    ]);
  });

  test("names are exact, kept in the order given, and the rest are reported unknown", async () => {
    const result = await search({
      names: ["solana_wallet_get_balance", "solana_nope", "solana_swap_get_quote", "solana_nope"],
    });
    expect(result.mode).toBe("names");
    expect(result.matches.map((m) => m.name)).toEqual([
      "solana_wallet_get_balance",
      "solana_swap_get_quote",
    ]);
    expect(result.unknown).toEqual(["solana_nope"]);
    expect(result.notes).toEqual(["1 of the names given is not a tool; see unknown."]);
  });

  test("a query ranks through the selector, carries scores, and says who ranked", async () => {
    const result = await search({ query: "swap SOL for USDC" });
    expect(result.mode).toBe("query");
    expect(result.selector).toBe("local");
    expect(result.matches[0]?.name).toBe("solana_swap_execute_swap");
    expect(result.matches[0]?.score).toBeGreaterThan(0);
    expect(result.matches.every((m) => typeof m.score === "number")).toBe(true);
  });

  test("the cap lists a few and counts the rest", async () => {
    const result = await search({ group: "swap", limit: 2 }, "execute");
    expect(result.matches).toHaveLength(2);
    expect(result.matched).toBe(3);
    expect(result.notes).toEqual([
      "Listed 2 of 3 matching tools. Raise limit or narrow the request to see the rest.",
    ]);
  });

  test("availability is counted over every match, not only the listed ones", async () => {
    const result = await search({ group: "swap", limit: 0 });
    expect(result.matches).toEqual([]);
    expect(result.matched).toBe(3);
    expect(result.notes).toEqual([
      "Listed 0 of 3 matching tools. Raise limit or narrow the request to see the rest.",
      "1 matching tool exists above this server's tier ceiling (simulate) and cannot be called here. Ask the Operator to start the server with --tier execute.",
    ]);
  });

  test("nothing matched explains what solOS covers, naming the groups", async () => {
    const result = await search({ query: "weather forecast tomorrow" });
    expect(result.matches).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.groups).toEqual(["swap", "wallet"]);
    expect(result.notes).toEqual([
      "No tool covers this request. solOS covers these groups: swap, wallet.",
    ]);
  });

  test("names that are all unknown say so instead of listing groups", async () => {
    const result = await search({ names: ["nope"] });
    expect(result.matches).toEqual([]);
    expect(result.unknown).toEqual(["nope"]);
    expect(result.notes[0]).toContain("None of the names given is a tool");
  });

  test("more than one mode is refused before anything is ranked", async () => {
    const error = await Effect.runPromise(
      searchTools({ query: "swap", group: "swap", limit: 8 }).pipe(
        Effect.flip,
        Effect.provide(env("simulate")),
      ),
    );
    expect(error).toMatchObject({
      _tag: "SelectionInputInvalid",
      reason: "give exactly one of query, group or names",
    });
  });
});
