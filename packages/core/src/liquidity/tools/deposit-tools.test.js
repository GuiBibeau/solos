// @ts-check
import { describe, expect, test } from "bun:test";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import {
  LiquidityDepositInputSchema,
  LiquidityExecuteDepositInputSchema,
} from "../domain/types.js";
import { executeDepositTool } from "./execute-deposit.js";
import { simulateDepositTool } from "./simulate-deposit.js";

const base = {
  protocol: "orca",
  pool: "2".repeat(44),
  position: "2".repeat(44),
  amountA: "1000000",
  amountB: "0",
};

describe("liquidity deposit tools input guard", () => {
  test("both twins reject supported-but-unimplemented protocols before any runtime", () => {
    for (const tool of [simulateDepositTool, executeDepositTool]) {
      expect(tool.check).toBeTypeOf("function");
      for (const protocol of ["meteora", "raydium"]) {
        expect(() => tool.check({ ...base, protocol }), `${tool.name} ${protocol}`).toThrow(
          LiquidityUnsupportedProtocol,
        );
      }
    }
  });

  test("orca passes the pure guard", () => {
    for (const tool of [simulateDepositTool, executeDepositTool]) {
      expect(tool.check(base)).toBeUndefined();
    }
  });

  test("the schema rejects malformed requests before the guard runs", () => {
    expect(LiquidityDepositInputSchema.safeParse({ ...base, protocol: "jupiter" }).success).toBe(
      false,
    );
    // All-zero budgets pass the per-field schema; the cross-field rule is a use-case check.
    expect(
      LiquidityDepositInputSchema.safeParse({ ...base, amountA: "0", amountB: "0" }).success,
    ).toBe(true);
    expect(
      LiquidityDepositInputSchema.safeParse({ ...base, amountA: "18446744073709551616" }).success,
    ).toBe(false);
    expect(LiquidityDepositInputSchema.safeParse({ ...base, maxSlippageBps: 10_000 }).success).toBe(
      false,
    );
    expect(LiquidityDepositInputSchema.safeParse(base).success).toBe(true);
  });

  test("the simulate twin is simulate-tier and describes every argument", () => {
    expect(simulateDepositTool.name).toBe("solana_liquidity_simulate_deposit");
    expect(simulateDepositTool.group).toBe("liquidity");
    expect(simulateDepositTool.tier).toBe("simulate");
    for (const key of ["protocol", "pool", "position", "amountA", "amountB", "maxSlippageBps"]) {
      expect(simulateDepositTool.input.shape[key]?.description, key).toBeTruthy();
    }
    expect(simulateDepositTool.input.parse(base).maxSlippageBps).toBe(50);
  });

  test("the execute twin is execute-tier, defaults skipSimulation false, describes it", () => {
    expect(executeDepositTool.name).toBe("solana_liquidity_execute_deposit");
    expect(executeDepositTool.group).toBe("liquidity");
    expect(executeDepositTool.tier).toBe("execute");
    expect(executeDepositTool.input.shape.skipSimulation?.description).toBeTruthy();
    const parsed = LiquidityExecuteDepositInputSchema.parse(base);
    expect(parsed.skipSimulation).toBe(false);
    expect(
      LiquidityExecuteDepositInputSchema.parse({ ...base, skipSimulation: true }).skipSimulation,
    ).toBe(true);
  });
});
