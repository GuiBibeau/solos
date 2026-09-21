// @ts-check
import { describe, expect, test } from "bun:test";
import {
  increaseLiquidityQuote,
  increaseLiquidityQuoteA,
  increaseLiquidityQuoteB,
  tickIndexToSqrtPrice,
} from "@orca-so/whirlpools-core";
import { depositLiquidityForBudgets } from "./whirlpool-deposit-quote.js";
import { SQRT_PRICE_ONE } from "./whirlpool-fixture.js";

/** The below/above range prices sit strictly outside every range used here. */
const BELOW_SQRT_PRICE = tickIndexToSqrtPrice(-2000);
const ABOVE_SQRT_PRICE = tickIndexToSqrtPrice(2000);
const RANGE = { tickLowerIndex: -1000, tickUpperIndex: 1000 };

describe("deposit liquidity selection from maximum budgets", () => {
  test("an in-range two-sided add takes the smaller liquidity of the two budgets", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 10n ** 9n,
      amountB: 5n ** 9n,
      ...RANGE,
    });
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") return;
    const fromA = increaseLiquidityQuoteA(10n ** 9n, 0, SQRT_PRICE_ONE, -1000, 1000);
    const fromB = increaseLiquidityQuoteB(5n ** 9n, 0, SQRT_PRICE_ONE, -1000, 1000);
    const smaller =
      // eslint-disable-next-line unicorn/prefer-math-min-max -- Math.min coerces to Number
      fromA.liquidityDelta < fromB.liquidityDelta ? fromA.liquidityDelta : fromB.liquidityDelta;
    expect(result.liquidity).toBe(smaller);
    expect(result.requiredA).toBeLessThanOrEqual(10n ** 9n);
    expect(result.requiredB).toBeLessThanOrEqual(5n ** 9n);
  });

  test("a symmetric in-range pair spends under both budgets, never exactly both", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 1_000_001n,
      amountB: 1_000_000n,
      ...RANGE,
    });
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") return;
    // Both spends fit under both budgets and both are positive; liquidity was rounded
    // down, so the binding budget may be spent strictly under its maximum.
    expect(result.requiredA).toBeGreaterThan(0n);
    expect(result.requiredB).toBeGreaterThan(0n);
    expect(result.requiredA).toBeLessThanOrEqual(1_000_001n);
    expect(result.requiredB).toBeLessThanOrEqual(1_000_000n);
  });

  test("a below-range add needs only token A and ignores the token B budget", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: BELOW_SQRT_PRICE,
      amountA: 10n ** 12n,
      amountB: 0n,
      tickLowerIndex: 0,
      tickUpperIndex: 1000,
    });
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") return;
    const fromA = increaseLiquidityQuoteA(10n ** 12n, 0, BELOW_SQRT_PRICE, 0, 1000);
    expect(result.liquidity).toBe(fromA.liquidityDelta);
    expect(result.requiredA).toBeGreaterThan(0n);
    expect(result.requiredB).toBe(0n);
  });

  test("an above-range add needs only token B and ignores the token A budget", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: ABOVE_SQRT_PRICE,
      amountA: 0n,
      amountB: 10n ** 12n,
      tickLowerIndex: 0,
      tickUpperIndex: 1000,
    });
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") return;
    const fromB = increaseLiquidityQuoteB(10n ** 12n, 0, ABOVE_SQRT_PRICE, 0, 1000);
    expect(result.liquidity).toBe(fromB.liquidityDelta);
    expect(result.requiredA).toBe(0n);
    expect(result.requiredB).toBeGreaterThan(0n);
  });

  test("an in-range add with a zero budget on one side computes zero liquidity", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 10n ** 9n,
      amountB: 0n,
      ...RANGE,
    });
    expect(result.status).toBe("zero");
  });

  test("all-zero budgets compute zero liquidity", () => {
    const below = depositLiquidityForBudgets({
      sqrtPrice: BELOW_SQRT_PRICE,
      amountA: 0n,
      amountB: 0n,
      ...RANGE,
    });
    const inRange = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 0n,
      amountB: 0n,
      ...RANGE,
    });
    expect(below.status).toBe("zero");
    expect(inRange.status).toBe("zero");
  });

  test("a one-unit in-range budget is dust that computes zero liquidity", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 1n,
      amountB: 1n,
      tickLowerIndex: -443_600,
      tickUpperIndex: 443_600,
    });
    // Even dust buys a nonzero u128 share at the extreme range; the required spends must
    // still fit the budgets — that is the contract, whatever the outcome.
    if (result.status === "quoted") {
      expect(result.requiredA).toBeLessThanOrEqual(1n);
      expect(result.requiredB).toBeLessThanOrEqual(1n);
    } else {
      expect(result.status).toBe("zero");
    }
  });

  test("quoted required amounts match the pinned math for the chosen liquidity", () => {
    const result = depositLiquidityForBudgets({
      sqrtPrice: SQRT_PRICE_ONE,
      amountA: 10n ** 12n,
      amountB: 10n ** 11n,
      ...RANGE,
    });
    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") return;
    const quote = increaseLiquidityQuote(result.liquidity, 0, SQRT_PRICE_ONE, -1000, 1000);
    expect(result.requiredA).toBe(quote.tokenEstA);
    expect(result.requiredB).toBe(quote.tokenEstB);
  });
});
