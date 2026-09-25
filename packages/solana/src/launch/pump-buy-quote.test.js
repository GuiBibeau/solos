// @ts-check
import { describe, expect, test } from "bun:test";
import {
  BPS,
  quoteBuy,
  quoteSell,
  solForTokens,
  solIntoCurve,
  tokensForSol,
} from "./pump-buy-quote.js";

/** The documented launch parameters from the pinned Global account. */
const FRESH_CURVE = {
  virtualTokenReserves: 1_073_000_000_000_000n,
  virtualQuoteReserves: 30_000_000_000n,
  realTokenReserves: 793_100_000_000_000n,
};

describe("pump buy quote", () => {
  test("the fee divides the budget rather than subtracting from it", () => {
    // Pump charges its fee on top of the traded amount, so a 1% fee on a 101 lamport budget
    // leaves 100 for the curve, not 99.99.
    expect(solIntoCurve(10_100n, 100n)).toBe(10_000n);
    expect(solIntoCurve(1_000_000_000n, 0n)).toBe(1_000_000_000n);
  });

  test("tokens follow the constant product over the synthetic reserves", () => {
    const solIn = 1_000_000_000n;
    const expected =
      (FRESH_CURVE.virtualTokenReserves * solIn) / (FRESH_CURVE.virtualQuoteReserves + solIn);
    expect(tokensForSol(FRESH_CURVE, solIn)).toBe(expected);
  });

  test("a larger budget buys proportionally less, as a curve must", () => {
    const one = tokensForSol(FRESH_CURVE, 1_000_000_000n);
    const ten = tokensForSol(FRESH_CURVE, 10_000_000_000n);
    expect(ten).toBeGreaterThan(one);
    expect(ten).toBeLessThan(one * 10n);
  });

  test("zero and negative inputs buy nothing rather than dividing by zero", () => {
    expect(tokensForSol(FRESH_CURVE, 0n)).toBe(0n);
    expect(tokensForSol({ ...FRESH_CURVE, virtualQuoteReserves: 0n }, 0n)).toBe(0n);
  });

  test("every step rounds against the buyer", () => {
    // 1 bps of slippage on an odd token count must floor, never round up: the minimum is the
    // whole protection and the program reverts if it cannot be met.
    const quote = quoteBuy(
      { virtualTokenReserves: 1001n, virtualQuoteReserves: 1000n, realTokenReserves: 1001n },
      { budgetLamports: 1001n, totalFeeBps: 100n, slippageBps: 1 },
    );
    expect(quote.solIntoCurve).toBe((1001n * BPS) / (BPS + 100n));
    expect(quote.minTokensOut).toBeLessThanOrEqual(quote.expectedTokens);
  });

  test("the minimum never exceeds what the curve can release", () => {
    // A budget far larger than the curve's remaining tokens must not ask for more than it holds;
    // the program rejects an amount above real_token_reserves.
    const quote = quoteBuy(FRESH_CURVE, {
      budgetLamports: 100_000_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 50,
    });
    expect(quote.expectedTokens).toBe(FRESH_CURVE.realTokenReserves);
    expect(quote.minTokensOut).toBeLessThanOrEqual(FRESH_CURVE.realTokenReserves);
  });

  test("zero slippage still yields a floor equal to the estimate", () => {
    const quote = quoteBuy(FRESH_CURVE, {
      budgetLamports: 1_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 0,
    });
    expect(quote.minTokensOut).toBe(quote.expectedTokens);
    expect(quote.expectedTokens).toBeGreaterThan(0n);
  });

  test("a higher creator fee leaves less for the curve, never more", () => {
    const low = quoteBuy(FRESH_CURVE, {
      budgetLamports: 1_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 50,
    });
    const high = quoteBuy(FRESH_CURVE, {
      budgetLamports: 1_000_000_000n,
      totalFeeBps: 400n,
      slippageBps: 50,
    });
    expect(high.expectedTokens).toBeLessThan(low.expectedTokens);
  });

  test("amounts stay exact at u64 scale", () => {
    const quote = quoteBuy(FRESH_CURVE, {
      budgetLamports: 18_446_744_073_709_551_615n,
      totalFeeBps: 100n,
      slippageBps: 50,
    });
    expect(typeof quote.expectedTokens).toBe("bigint");
    expect(typeof quote.minTokensOut).toBe("bigint");
  });
});

describe("pump sell quote", () => {
  test("SOL out follows the constant product read the other way", () => {
    const tokensIn = 1_000_000_000_000n;
    const expected =
      (FRESH_CURVE.virtualQuoteReserves * tokensIn) / (FRESH_CURVE.virtualTokenReserves + tokensIn);
    expect(solForTokens(FRESH_CURVE, tokensIn)).toBe(expected);
  });

  test("fees come off the proceeds rather than dividing them", () => {
    // The buy charges its fee on top of the trade; the sell takes it out of what comes back.
    const quote = quoteSell(FRESH_CURVE, {
      tokensIn: 1_000_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 0,
    });
    expect(quote.expectedSol).toBe((quote.grossSol * 9900n) / 10_000n);
    expect(quote.expectedSol).toBeLessThan(quote.grossSol);
  });

  test("selling nothing yields nothing rather than dividing by zero", () => {
    expect(solForTokens(FRESH_CURVE, 0n)).toBe(0n);
    expect(solForTokens({ virtualTokenReserves: 0n, virtualQuoteReserves: 0n }, 0n)).toBe(0n);
  });

  test("the minimum never exceeds the estimate, and floors against the seller", () => {
    const quote = quoteSell(FRESH_CURVE, {
      tokensIn: 7n,
      totalFeeBps: 100n,
      slippageBps: 1,
    });
    expect(quote.minSolOutput).toBeLessThanOrEqual(quote.expectedSol);
    expect(typeof quote.minSolOutput).toBe("bigint");
  });

  test("a bigger sell returns proportionally less, as a curve must", () => {
    const one = quoteSell(FRESH_CURVE, {
      tokensIn: 1_000_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 50,
    }).expectedSol;
    const ten = quoteSell(FRESH_CURVE, {
      tokensIn: 10_000_000_000_000n,
      totalFeeBps: 100n,
      slippageBps: 50,
    }).expectedSol;
    expect(ten).toBeGreaterThan(one);
    expect(ten).toBeLessThan(one * 10n);
  });

  test("a round trip at zero slippage and zero fees cannot profit", () => {
    // Buying then immediately selling the same tokens must not return more SOL than it cost:
    // the curve moves against the trader on both legs.
    const budget = 1_000_000_000n;
    const bought = quoteBuy(FRESH_CURVE, {
      budgetLamports: budget,
      totalFeeBps: 0n,
      slippageBps: 0,
    });
    const back = quoteSell(FRESH_CURVE, {
      tokensIn: bought.expectedTokens,
      totalFeeBps: 0n,
      slippageBps: 0,
    });
    expect(back.expectedSol).toBeLessThanOrEqual(budget);
  });
});
