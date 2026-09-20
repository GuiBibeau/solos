import { describe, expect, test } from "bun:test";
import { validateTool } from "./shared/tools/validate-tool.js";
import { allTools, toolGroups } from "./index.js";

describe("tool registry", () => {
  test("has at least the wallet, transfer, market, launch, liquidity, perp, and swap tools", () => {
    expect(allTools.map((t) => t.name)).toEqual([
      "solana_launch_get_curve",
      "solana_lend_get_position",
      "solana_lend_get_reserve",
      "solana_liquidity_get_position",
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_perp_get_position",
      "solana_swap_get_quote",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
    expect(toolGroups).toEqual([
      "launch",
      "lend",
      "liquidity",
      "market",
      "perp",
      "swap",
      "transfer",
      "wallet",
    ]);
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

  test("the token tool is a read-tier market tool with a described mint input", () => {
    const tool = allTools.find((t) => t.name === "solana_market_get_token");
    expect(tool?.group).toBe("market");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.mint?.description).toBeTruthy();
  });

  test("the swap quote tool is a read-tier swap tool with described arguments", () => {
    const tool = allTools.find((t) => t.name === "solana_swap_get_quote");
    expect(tool?.group).toBe("swap");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.inputMint?.description).toBeTruthy();
    expect(tool?.input.shape.outputMint?.description).toBeTruthy();
    expect(tool?.input.shape.amount?.description).toBeTruthy();
    expect(tool?.input.shape.slippageBps?.description).toBeTruthy();
  });

  test("the launch curve tool is a read-tier launch tool with a described mint input", () => {
    const tool = allTools.find((t) => t.name === "solana_launch_get_curve");
    expect(tool?.group).toBe("launch");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.mint?.description).toBeTruthy();
  });

  test("the lend reserve tool is a read-tier lend tool with a described mint input", () => {
    const tool = allTools.find((t) => t.name === "solana_lend_get_reserve");
    expect(tool?.group).toBe("lend");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.mint?.description).toBeTruthy();
  });

  test("the lend position tool describes its mint and optional owner", () => {
    const tool = allTools.find((t) => t.name === "solana_lend_get_position");
    expect(tool?.group).toBe("lend");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.mint?.description).toBeTruthy();
    expect(tool?.input.shape.owner?.description).toBeTruthy();
  });

  test("the lend slice advertises no deposit or withdraw tools yet", () => {
    const names = allTools.map((t) => t.name);
    expect(names).not.toContain("solana_lend_deposit");
    expect(names).not.toContain("solana_lend_withdraw");
  });

  test("the liquidity position tool is a read-tier liquidity tool with described arguments", () => {
    const tool = allTools.find((t) => t.name === "solana_liquidity_get_position");
    expect(tool?.group).toBe("liquidity");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.protocol?.description).toBeTruthy();
    expect(tool?.input.shape.position?.description).toBeTruthy();
    expect(tool?.input.shape.owner?.description).toBeTruthy();
  });

  test("the perp position tool is a read-tier perp tool with described arguments", () => {
    const tool = allTools.find((t) => t.name === "solana_perp_get_position");
    expect(tool?.group).toBe("perp");
    expect(tool?.tier).toBe("read");
    expect(tool?.input.shape.market?.description).toBeTruthy();
    expect(tool?.input.shape.owner?.description).toBeTruthy();
  });
});
