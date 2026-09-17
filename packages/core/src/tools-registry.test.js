import { describe, expect, test } from "bun:test";
import { validateTool } from "./shared/tools/validate-tool.js";
import { allTools, toolGroups } from "./index.js";

describe("tool registry", () => {
  test("has at least the wallet, transfer, and market tools", () => {
    expect(allTools.map((t) => t.name)).toEqual([
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
    expect(toolGroups).toEqual(["market", "transfer", "wallet"]);
  });

  test("every tool is discovery-friendly", () => {
    for (const tool of allTools) {
      expect(validateTool(tool), tool.name).toEqual([]);
    }
  });

  test("names are unique and sorted", () => {
    const names = allTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].toSorted((a, b) => a.localeCompare(b)));
  });

  test("every execute tool has a simulate twin", () => {
    const names = new Set(allTools.map((t) => t.name));
    for (const tool of allTools.filter((t) => t.tier === "execute")) {
      const twin = tool.name.replace(/_send_|_execute_/, "_simulate_");
      expect(names.has(twin), `${tool.name} needs ${twin}`).toBe(true);
    }
  });

  test("the Iris tool is a read-tier market tool with a described question input", () => {
    const tool = allTools.find((t) => t.name === "solana_market_ask_iris");
    expect(tool?.group).toBe("market");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.question?.description).toBeTruthy();
  });

  test("the price tool is a read-tier market tool with a described mint input", () => {
    const tool = allTools.find((t) => t.name === "solana_market_get_price");
    expect(tool?.group).toBe("market");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.mint?.description).toBeTruthy();
  });
});
