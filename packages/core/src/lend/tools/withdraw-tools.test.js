// @ts-check
import { describe, expect, test } from "bun:test";
import { allTools } from "../../index.js";

describe("Kamino withdrawal tools", () => {
  test("exposes paired verbs with positive underlying targets and honest collateral-input semantics", () => {
    const simulate = allTools.find((tool) => tool.name === "solana_lend_simulate_withdraw");
    const execute = allTools.find((tool) => tool.name === "solana_lend_execute_withdraw");
    expect(simulate?.tier).toBe("simulate");
    expect(execute?.tier).toBe("execute");
    expect(simulate?.description).toContain("NOT an on-chain minimum");
    expect(execute?.description).toContain("NOT a guaranteed minimum");
    expect(execute?.input.shape.amount.description).toContain(
      "actual underlying output can differ",
    );
    expect(
      simulate?.input.safeParse({
        mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        amount: "0",
      }).success,
    ).toBe(false);
  });
});
