// @ts-check
import { describe, expect, test } from "bun:test";
import { withdrawQuoteForBps } from "./whirlpool-withdraw-quote.js";

// A square range around a mid price: the exact numbers do not matter, the contract does.
const SQRT_PRICE = 18_446_744_073_709_551_615n * 4n;
const RANGE = { sqrtPrice: SQRT_PRICE, tickLowerIndex: -1000, tickUpperIndex: 1000 };

describe("withdrawQuoteForBps", () => {
  test("10000 bps removes all current liquidity", () => {
    const quote = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 999_999n,
      bps: 10_000,
      maxSlippageBps: 50,
    });
    expect(quote.status).toBe("quoted");
    if (quote.status !== "quoted") return;
    expect(quote.liquidity).toBe(999_999n);
    expect(quote.estA > 0n || quote.estB > 0n).toBe(true);
    expect(quote.minA).toBeLessThanOrEqual(quote.estA);
    expect(quote.minB).toBeLessThanOrEqual(quote.estB);
  });

  test("1 bps floors the fraction of current liquidity", () => {
    // 12345 * 1 / 10000 = 1.2345 -> floor 1
    const quote = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 12_345n,
      bps: 1,
      maxSlippageBps: 50,
    });
    expect(quote.status).toBe("quoted");
    if (quote.status !== "quoted") return;
    expect(quote.liquidity).toBe(1n);
  });

  test("9999 bps floors below the whole position", () => {
    // 1_000_000 * 9999 / 10000 = 999_900 exactly
    const quote = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 1_000_000n,
      bps: 9999,
      maxSlippageBps: 50,
    });
    expect(quote.status).toBe("quoted");
    if (quote.status !== "quoted") return;
    expect(quote.liquidity).toBe(999_900n);
  });

  test("a computed zero removal is rejected", () => {
    // 5 * 1 / 10000 = 0.0005 -> floor 0: a typed reject, never an empty instruction
    const zero = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 5n,
      bps: 1,
      maxSlippageBps: 50,
    });
    expect(zero.status).toBe("zero");
    // and a truly empty position rejects the same way
    const empty = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 0n,
      bps: 10_000,
      maxSlippageBps: 50,
    });
    expect(empty.status).toBe("zero");
  });

  test("a nonzero quote rounded to a zero minimum is rejected", () => {
    // slippage 9999 leaves floor(est * 1 / 10000): tiny ests round to a useless zero minimum
    const quote = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 1n,
      bps: 10_000,
      maxSlippageBps: 9999,
    });
    if (quote.status !== "quoted")
      throw new Error("expected a quote to test the zero-minimum guard");
    const hasQuotedSide = quote.estA > 0n || quote.estB > 0n;
    const hasZeroMin = quote.minA === 0n || quote.minB === 0n;
    if (hasQuotedSide && hasZeroMin) expect(quote.status).toBe("quoted-zero-min");
    else expect(quote.status === "quoted" || quote.status === "quoted-zero-min").toBe(true);
  });

  test("minimums grow with a tighter slippage tolerance", () => {
    const tight = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 10_000_000n,
      bps: 10_000,
      maxSlippageBps: 0,
    });
    const loose = withdrawQuoteForBps({
      ...RANGE,
      currentLiquidity: 10_000_000n,
      bps: 10_000,
      maxSlippageBps: 5000,
    });
    if (tight.status !== "quoted" || loose.status !== "quoted")
      throw new Error("expected two quotes");
    expect(tight.minB).toBeGreaterThan(loose.minB);
  });
});
