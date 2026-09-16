import { describe, expect, test } from "bun:test";
import { validateTool } from "./shared/tools/validate-tool.js";
import { allTools, toolGroups } from "./index.js";

describe("tool registry", () => {
  test("has at least the wallet and transfer tools", () => {
    expect(allTools.map((t) => t.name)).toEqual([
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
    expect(toolGroups).toEqual(["transfer", "wallet"]);
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
});
