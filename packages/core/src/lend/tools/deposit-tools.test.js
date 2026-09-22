// @ts-check
import { describe, expect, test } from "bun:test";
import { LendDepositInputSchema, LendExecuteDepositInputSchema } from "../domain/types.js";
import { executeDepositTool } from "./execute-deposit.js";
import { simulateDepositTool } from "./simulate-deposit.js";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const base = { mint: MINT, amount: "1000000" };

describe("lend deposit tools", () => {
  test("the simulate twin is simulate-tier and describes every argument", () => {
    expect(simulateDepositTool.name).toBe("solana_lend_simulate_deposit");
    expect(simulateDepositTool.group).toBe("lend");
    expect(simulateDepositTool.tier).toBe("simulate");
    for (const key of ["mint", "amount"]) {
      expect(simulateDepositTool.input.shape[key]?.description, key).toBeTruthy();
    }
  });

  test("the execute twin is execute-tier, defaults skipSimulation false, describes it", () => {
    expect(executeDepositTool.name).toBe("solana_lend_execute_deposit");
    expect(executeDepositTool.group).toBe("lend");
    expect(executeDepositTool.tier).toBe("execute");
    expect(executeDepositTool.input.shape.skipSimulation?.description).toBeTruthy();
    expect(LendExecuteDepositInputSchema.parse(base).skipSimulation).toBe(false);
    expect(
      LendExecuteDepositInputSchema.parse({ ...base, skipSimulation: true }).skipSimulation,
    ).toBe(true);
  });

  test("the schema rejects malformed requests before any runtime exists", () => {
    expect(LendDepositInputSchema.safeParse({ mint: MINT, amount: "0" }).success).toBe(false);
    expect(
      LendDepositInputSchema.safeParse({ mint: MINT, amount: "18446744073709551616" }).success,
    ).toBe(false);
    expect(LendDepositInputSchema.safeParse({ ...base, amount: "1.5" }).success).toBe(false);
    expect(LendDepositInputSchema.safeParse({ mint: "short", amount: "1" }).success).toBe(false);
    expect(LendDepositInputSchema.safeParse(base).success).toBe(true);
  });
});
