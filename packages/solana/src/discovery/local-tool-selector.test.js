// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools, selectTools } from "@solos/core";
import { Effect } from "effect";
import { LocalToolSelectorLive } from "./local-tool-selector.js";

/** @param {{ query: string; limit?: number }} input */
const select = (input) =>
  Effect.runPromise(
    selectTools({ ...input, tools: allTools }).pipe(Effect.provide(LocalToolSelectorLive)),
  );

describe("free-text tool selection with the local adapter [integration]", () => {
  test("the registry is ranked locally, and the selection says the local selector ranked it", async () => {
    const selection = await select({ query: "swap SOL for USDC" });
    expect(selection.selector).toBe("local");
    expect(selection.fallback).toBeUndefined();
    expect(selection.matches.slice(0, 3).map((match) => match.name)).toEqual([
      "solana_swap_execute_swap",
      "solana_swap_get_quote",
      "solana_swap_simulate_swap",
    ]);
  });

  test("the matches are capped, and the selection reports how many tools matched", async () => {
    const selection = await select({ query: "swap SOL for USDC", limit: 2 });
    expect(selection.matches).toHaveLength(2);
    expect(selection.matched).toBeGreaterThan(2);
  });

  test("a request no tool mentions selects nothing", async () => {
    const selection = await select({ query: "weather forecast tomorrow" });
    expect(selection.matches).toEqual([]);
    expect(selection.matched).toBe(0);
  });
});
