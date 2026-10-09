// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "@solos/core";
import { renderSliceTable, renderToolTable, sliceNames } from "./render.js";

/** @type {Array<{ name: string, tier: string, stability: string, group: string }>} */
const sample = [
  { name: "solana_lend_execute_deposit", tier: "execute", stability: "stable", group: "lend" },
  { name: "solana_lend_get_reserve", tier: "read", stability: "beta", group: "lend" },
  { name: "solana_wallet_get_balance", tier: "read", stability: "beta", group: "wallet" },
];

describe("docs rendering", () => {
  test("the tool table carries a row per tool with its tier, stability and slice", () => {
    expect(renderToolTable(sample).split("\n")).toEqual([
      "| Tool | Tier | Stability | Slice |",
      "|---|---|---|---|",
      "| `solana_lend_execute_deposit` | execute | stable | `lend` |",
      "| `solana_lend_get_reserve` | read | beta | `lend` |",
      "| `solana_wallet_get_balance` | read | beta | `wallet` |",
    ]);
  });

  test("tiers read in read/simulate/execute order, not alphabetically", () => {
    const rendered = renderSliceTable(["lend"], sample);
    expect(rendered).toContain("| `lend` | 2 | read, execute |");
  });

  test("a ports-only slice is listed rather than being invisible", () => {
    expect(renderSliceTable(["signals"], sample)).toContain("| `signals` | 0 | ports only |");
  });

  test("slices come from the filesystem, so every core slice is covered", () => {
    const slices = sliceNames();
    expect(slices).toContain("signals");
    expect(slices).not.toContain("shared");
    expect(slices).toEqual([...slices].toSorted((a, b) => a.localeCompare(b)));
    for (const tool of allTools) expect(slices).toContain(tool.group);
  });
});
