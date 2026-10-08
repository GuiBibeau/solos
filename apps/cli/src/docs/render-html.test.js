// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "@solos/core";
import { z } from "zod";
import { renderToolsHtml } from "./render-html.js";

/** @type {import("./render-html.js").ToolDoc[]} */
const sample = [
  {
    name: "solana_perp_execute_open",
    group: "perp",
    tier: "execute",
    title: "Open a perp position",
    description: "Open <b>bounded</b> & capped.",
    input: z.object({
      side: z.enum(["long", "short"]).describe("Long to buy or short to sell"),
      maxLeverage: z.number().int().min(1).max(100).describe("Requested leverage"),
      slippageBps: z.number().int().min(0).max(10_000).default(50).describe("Max slippage"),
      mints: z.array(z.string()).describe("Mints to include"),
    }),
  },
  {
    name: "solana_wallet_get_address",
    group: "wallet",
    tier: "read",
    title: "Get the wallet address",
    description: "No input.",
    input: z.object({}),
  },
];

describe("tool reference html", () => {
  const html = renderToolsHtml(sample);

  test("one section per group, in first-seen order, with a group index", () => {
    expect(html).toContain(
      '<nav class="toc">\n<a href="#perp">perp</a>\n<a href="#wallet">wallet</a>\n</nav>',
    );
    expect(html.indexOf('<section class="group" id="perp">')).toBeLessThan(
      html.indexOf('<section class="group" id="wallet">'),
    );
    expect(html).toContain('<span class="count">1 tool</span>');
  });

  test("a tool carries its name as anchor, its tier and its escaped description", () => {
    expect(html).toContain('<article class="tool" id="solana_perp_execute_open">');
    expect(html).toContain('<span class="tier tier-execute">execute</span>');
    expect(html).toContain('<p class="desc">Open &lt;b&gt;bounded&lt;/b&gt; &amp; capped.</p>');
  });

  test("arguments show type, required flag, description and bounds", () => {
    expect(html).toContain(
      "<tr><td><code>side</code></td><td>long | short</td><td>yes</td><td>Long to buy or short to sell</td></tr>",
    );
    expect(html).toContain(
      '<td>no</td><td>Max slippage <span class="meta">default 50 · 0 to 10000</span></td>',
    );
    expect(html).toContain("<td>string[]</td>");
    expect(html).toContain('<td>Requested leverage <span class="meta">1 to 100</span></td>');
  });

  test("a tool without arguments says so", () => {
    expect(html).toContain('<p class="noargs">No arguments.</p>');
  });

  test("the real registry renders every tool with an anchor", () => {
    const rendered = renderToolsHtml(allTools);
    for (const tool of allTools) {
      expect(rendered).toContain(`<article class="tool" id="${tool.name}">`);
    }
  });
});
