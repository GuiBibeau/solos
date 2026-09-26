// @ts-check
import { describe, expect, test } from "bun:test";
import {
  LiquidityExecuteWithdrawInputSchema,
  LiquidityWithdrawInputSchema,
} from "../domain/types.js";
import { executeWithdrawTool } from "./execute-withdraw.js";
import { simulateWithdrawTool } from "./simulate-withdraw.js";

const base = {
  protocol: "orca",
  position: "2".repeat(44),
  bps: 10_000,
};

describe("liquidity withdraw tools input guard", () => {
  test("orca, raydium, and meteora pass the pure guard", () => {
    for (const tool of [simulateWithdrawTool, executeWithdrawTool]) {
      expect(tool.check).toBeTypeOf("function");
      for (const protocol of ["orca", "raydium", "meteora"]) {
        expect(tool.check({ ...base, protocol }), `${tool.name} ${protocol}`).toBeUndefined();
      }
    }
  });

  test("the schema bounds bps to 1..10000 and slippage to 0..9999", () => {
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, protocol: "jupiter" }).success).toBe(
      false,
    );
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, bps: 0 }).success).toBe(false);
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, bps: 10_001 }).success).toBe(false);
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, bps: 1 }).success).toBe(true);
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, bps: 9999 }).success).toBe(true);
    expect(
      LiquidityWithdrawInputSchema.safeParse({ ...base, maxSlippageBps: 10_000 }).success,
    ).toBe(false);
    expect(LiquidityWithdrawInputSchema.safeParse({ ...base, bps: 1.5 }).success).toBe(false);
    // maxSlippageBps defaults to 50 when omitted
    const parsed = LiquidityWithdrawInputSchema.parse(base);
    expect(parsed.maxSlippageBps).toBe(50);
    expect(LiquidityExecuteWithdrawInputSchema.parse(base).skipSimulation).toBe(false);
  });

  test("the simulate twin is simulate-tier and describes every argument", () => {
    expect(simulateWithdrawTool.name).toBe("solana_liquidity_simulate_withdraw");
    expect(simulateWithdrawTool.group).toBe("liquidity");
    expect(simulateWithdrawTool.tier).toBe("simulate");
    for (const key of ["protocol", "position", "bps", "maxSlippageBps"]) {
      expect(simulateWithdrawTool.input.shape[key]?.description, key).toBeTruthy();
    }
  });

  test("the execute twin is execute-tier, adds skipSimulation, and describes every argument", () => {
    expect(executeWithdrawTool.name).toBe("solana_liquidity_execute_withdraw");
    expect(executeWithdrawTool.group).toBe("liquidity");
    expect(executeWithdrawTool.tier).toBe("execute");
    for (const key of ["protocol", "position", "bps", "maxSlippageBps", "skipSimulation"]) {
      expect(executeWithdrawTool.input.shape[key]?.description, key).toBeTruthy();
    }
  });
});
