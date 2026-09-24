// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "@solos/core";
import { renderSliceTable, renderToolTable, sliceNames } from "./render.js";

/** @type {Array<{ name: string, tier: string, group: string }>} */
const sample = [
  { name: "solana_lend_execute_deposit", tier: "execute", group: "lend" },
  { name: "solana_lend_get_reserve", tier: "read", group: "lend" },
  { name: "solana_wallet_get_balance", tier: "read", group: "wallet" },
];

describe("docs rendering", () => {
  test("the tool table carries a row per tool with its tier and slice", () => {
    expect(renderToolTable(sample).split("\n")).toEqual([
      "| Tool | Tier | Slice |",
      "|---|---|---|",
      "| `solana_lend_execute_deposit` | execute | `lend` |",
      "| `solana_lend_get_reserve` | read | `lend` |",
      "| `solana_wallet_get_balance` | read | `wallet` |",
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
