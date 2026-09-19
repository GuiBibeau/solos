import { describe, expect, test } from "bun:test";
import { ADD, CLOSE, LEND, OPEN, REMOVE, SWAP } from "./action.fixtures.js";
import { ActionSchema } from "./index.js";

describe("Trading Action boundaries", () => {
  test("preserves legacy Jupiter intent and explicit Pump routing", () => {
    expect(ActionSchema.parse(SWAP)).toEqual(SWAP);
    for (const venue of ["jupiter", "pump"]) {
      expect(ActionSchema.parse({ ...SWAP, venue })).toEqual({ ...SWAP, venue });
    }
    expect(ActionSchema.safeParse({ ...SWAP, venue: "auto" }).success).toBe(false);
  });

  test("LP adds need a position and at least one positive u64 spend budget", () => {
    for (const protocol of ["orca", "meteora", "raydium"]) {
      expect(ActionSchema.parse({ ...ADD, protocol }).type).toBe("add_liquidity");
    }
    for (const change of [
      { position: undefined },
      { amountA: "0" },
      { amountA: "-1" },
      { amountA: "bad" },
      { amountB: "1.1" },
      { amountA: 1 },
      { amountA: "18446744073709551616" },
      { maxSlippageBps: 10_000 },
    ]) {
      expect(ActionSchema.safeParse({ ...ADD, ...change }).success).toBe(false);
    }
    const large = { ...ADD, amountA: "18446744073709551615" };
    expect(ActionSchema.parse(large)).toEqual(large);
    expect(ActionSchema.safeParse({ ...ADD, amountA: "0", amountB: "1" }).success).toBe(true);
  });

  test("removal fraction and slippage cannot silently disable minimum receipts", () => {
    for (const bps of [1, 9999, 10_000])
      expect(ActionSchema.safeParse({ ...REMOVE, bps }).success).toBe(true);
    for (const bps of [0, 10_001, 0.5, -1])
      expect(ActionSchema.safeParse({ ...REMOVE, bps }).success).toBe(false);
    expect(ActionSchema.safeParse({ ...REMOVE, maxSlippageBps: 10_000 }).success).toBe(false);
    expect(ActionSchema.safeParse({ ...REMOVE, maxSlippageBps: 0 }).success).toBe(true);
  });

  test("perps require positive exact prices and the single supported account scope", () => {
    for (const action of [OPEN, CLOSE]) {
      for (const limitPriceUsd of [undefined, "0", "-1", "0.000", "Infinity", "1e3", 12]) {
        expect(ActionSchema.safeParse({ ...action, limitPriceUsd }).success).toBe(false);
      }
      for (const change of [
        { traderPdaIndex: 1 },
        { traderSubaccountIndex: 1 },
        { traderPdaIndex: undefined },
      ]) {
        expect(ActionSchema.safeParse({ ...action, ...change }).success).toBe(false);
      }
      expect(ActionSchema.safeParse({ ...action, limitPriceUsd: "0.000000001" }).success).toBe(
        true,
      );
    }
  });

  test("open notional cannot be zero, rounded through Number, or exceed u64", () => {
    for (const notionalUsd of ["0", "-1", "1.1", 9_007_199_254_740_992, "18446744073709551616"]) {
      expect(ActionSchema.safeParse({ ...OPEN, notionalUsd }).success).toBe(false);
    }
    expect(
      ActionSchema.parse({ ...OPEN, side: "short", notionalUsd: "9007199254740993" }),
    ).toMatchObject({
      side: "short",
      notionalUsd: "9007199254740993",
    });
    expect(ActionSchema.safeParse({ ...OPEN, maxLeverage: 0.5 }).success).toBe(false);
  });

  test("lending pins a market and uses positive underlying amounts", () => {
    for (const type of ["lend", "withdraw_lend"]) {
      for (const change of [
        { market: undefined },
        { market: "wrong" },
        { amount: "0" },
        { amount: "1.5" },
        { amount: "bad" },
      ]) {
        expect(ActionSchema.safeParse({ ...LEND, type, ...change }).success).toBe(false);
      }
    }
  });
});
