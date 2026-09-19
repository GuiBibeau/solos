// @ts-check
import { describe, expect, test } from "bun:test";
import { decreaseLiquidityQuote, tickIndexToSqrtPrice } from "@orca-so/whirlpools-core";
import { SQRT_PRICE_ONE } from "./whirlpool-fixture.js";
import { underlyingAmounts } from "./whirlpool-underlying.js";

const LIQUIDITY = 10n ** 12n;
const LOWER = -1000;
const UPPER = 1000;

/** @param {bigint} sqrtPrice @param {bigint} [liquidity] */
const amounts = (sqrtPrice, liquidity = LIQUIDITY) =>
  underlyingAmounts({ sqrtPrice, tickLowerIndex: LOWER, tickUpperIndex: UPPER, liquidity });

describe("whirlpool underlying amounts via the pinned protocol math", () => {
  test("an in-range position matches decreaseLiquidityQuote exactly on both sides", () => {
    const quote = decreaseLiquidityQuote(LIQUIDITY, 0, SQRT_PRICE_ONE, LOWER, UPPER);
    expect(amounts(SQRT_PRICE_ONE)).toEqual({
      amountA: quote.tokenEstA.toString(),
      amountB: quote.tokenEstB.toString(),
    });
  });

  test("a below-range position holds only token A, priced across the full range", () => {
    const below = tickIndexToSqrtPrice(LOWER);
    const quote = decreaseLiquidityQuote(LIQUIDITY, 0, below, LOWER, UPPER);
    expect(amounts(below)).toEqual({ amountA: quote.tokenEstA.toString(), amountB: "0" });
  });

  test("an above-range position holds only token B, priced across the full range", () => {
    const above = tickIndexToSqrtPrice(UPPER);
    const quote = decreaseLiquidityQuote(LIQUIDITY, 0, above, LOWER, UPPER);
    expect(amounts(above)).toEqual({ amountA: "0", amountB: quote.tokenEstB.toString() });
  });

  test("zero liquidity is a zero read without reaching the math", () => {
    expect(amounts(SQRT_PRICE_ONE, 0n)).toEqual({ amountA: "0", amountB: "0" });
  });

  test("base units never pass through a JS Number", () => {
    // Far above 2^53 (the Number danger zone) while still a legal quote input.
    const liquidity = (1n << 63n) + 987_654_321n;
    const quote = decreaseLiquidityQuote(liquidity, 0, SQRT_PRICE_ONE, LOWER, UPPER);
    expect(amounts(SQRT_PRICE_ONE, liquidity)).toEqual({
      amountA: quote.tokenEstA.toString(),
      amountB: quote.tokenEstB.toString(),
    });
  });

  test("outputs are decimal strings of the exact BigInt estimates", () => {
    const result = amounts(SQRT_PRICE_ONE);
    expect(result.amountA).toMatch(/^\d+$/);
    expect(result.amountB).toMatch(/^\d+$/);
    expect(BigInt(result.amountA)).toBeGreaterThan(0n);
  });
});
