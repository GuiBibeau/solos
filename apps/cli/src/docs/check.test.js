// @ts-check
import { describe, expect, test } from "bun:test";
import { checkDocs } from "./check.js";
import { compareRegion, describeDrift } from "./compare.js";

const region = "tools";
const body = [
  "| Tool | Tier | Stability | Slice |",
  "|---|---|---|---|",
  "| `solana_wallet_get_balance` | read | beta | `wallet` |",
].join("\n");
/** @param {string} inner */
const docWith = (inner) =>
  `intro\n<!-- generated: ${region} -->\n${inner}\n<!-- /generated: ${region} -->\noutro`;

describe("docs gate", () => {
  test("a matching region is current", () => {
    expect(compareRegion({ text: docWith(body), region, body })).toEqual({
      status: "current",
      detail: "",
    });
  });

  test("a missing region is reported, not treated as satisfied", () => {
    expect(compareRegion({ text: "no markers here", region, body })).toEqual({
      status: "missing",
      detail: 'no "tools" region',
    });
  });

  test("drift names the tools the document is missing", () => {
    const stale = body.replace("| `solana_wallet_get_balance` | read | beta | `wallet` |", "");
    const result = compareRegion({ text: docWith(stale), region, body });
    expect(result.status).toBe("stale");
    expect(result.detail).toBe("undocumented: solana_wallet_get_balance");
  });

  test("drift also names rows the registry no longer has", () => {
    expect(describeDrift("| `solana_gone_tool` | read | beta | `gone` |", body)).toBe(
      "undocumented: solana_wallet_get_balance; no longer in the registry: solana_gone_tool",
    );
  });

  test("identical rows rendered differently still count as drift", () => {
    expect(describeDrift("| `solana_wallet_get_balance` | read | beta | `wallet` |", body)).toBe(
      "same rows, different rendering",
    );
  });

  test("the committed tool reference, AGENTS.md and the landing page match the registry, and every stable label is earned", () => {
    const report = checkDocs({ write: false });
    expect(report.regions.map((r) => [r.file, r.status, r.detail])).toEqual([
      ["docs/reference/tools/index.md", "current", ""],
      ["AGENTS.md", "current", ""],
      ["docs/reference/tools/liquidity.md", "current", ""],
      ["apps/landing/public/tools.html", "current", ""],
      ["apps/landing/public/llms-full.txt", "current", ""],
    ]);
    expect(report.stability).toEqual({ ok: true, problems: [] });
    expect(report.ok).toBe(true);
  });
});
