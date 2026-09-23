// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "../../index.js";

describe("Kamino withdrawal tools", () => {
  test("exposes paired simulate and execute verbs with exact positive amounts", () => {
    const simulate = allTools.find((tool) => tool.name === "solana_lend_simulate_withdraw");
    const execute = allTools.find((tool) => tool.name === "solana_lend_execute_withdraw");
    expect(simulate?.tier).toBe("simulate");
    expect(execute?.tier).toBe("execute");
    expect(
      simulate?.input.safeParse({
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: "0",
      }).success,
    ).toBe(false);
  });
});
