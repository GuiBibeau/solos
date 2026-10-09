// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "@solos/core";
import { z } from "zod";
import { renderToolsMarkdown } from "./render-llms.js";

/** @type {import("./render-html.js").ToolDoc[]} */
const sample = [
  {
    name: "solana_swap_get_quote",
    group: "swap",
    tier: "read",
    stability: "beta",
    title: "Get indicative swap quote",
    description: "Quote a swap.",
    input: z.object({
      inputMint: z.string().describe("Mint to sell"),
      slippageBps: z.number().int().min(0).max(10_000).default(50).describe("Max slippage"),
    }),
  },
  {
    name: "solana_wallet_get_address",
    group: "wallet",
    tier: "read",
    stability: "beta",
    title: "Get the wallet address",
    description: "No input.",
    input: z.object({}),
  },
];

describe("tool catalogue markdown", () => {
  const markdown = renderToolsMarkdown(sample);

  test("groups are H2, tools are H3 with tier, title and description", () => {
    expect(markdown).toContain(
      "## swap\n\n### solana_swap_get_quote\n\nTier: read. Stability: beta. Get indicative swap quote.\n\nQuote a swap.",
    );
    expect(markdown.indexOf("## swap")).toBeLessThan(markdown.indexOf("## wallet"));
  });

  test("arguments list type, requirement, description and bounds", () => {
    expect(markdown).toContain("- `inputMint` (string, required): Mint to sell");
    expect(markdown).toContain(
      "- `slippageBps` (integer, optional): Max slippage; default 50 · 0 to 10000",
    );
  });

  test("a tool without arguments says so", () => {
    expect(markdown).toContain(
      "### solana_wallet_get_address\n\nTier: read. Stability: beta. Get the wallet address.\n\nNo input.\n\nNo arguments.",
    );
  });

  test("the real registry renders every tool as a heading", () => {
    const rendered = renderToolsMarkdown(allTools);
    for (const tool of allTools) expect(rendered).toContain(`\n### ${tool.name}\n`);
  });
});
