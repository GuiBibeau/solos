// @ts-check
import { describe, expect, test } from "bun:test";
import { assetValueScaled6, formatUsd, parseDecimal, toScaled6 } from "./valuation.js";

describe("portfolio valuation math", () => {
  test("parseDecimal keeps magnitude and scale of the written decimal", () => {
    expect(parseDecimal("123.45")).toEqual({ negative: false, magnitude: 12_345n, scale: 2 });
    expect(parseDecimal("7")).toEqual({ negative: false, magnitude: 7n, scale: 0 });
    expect(parseDecimal("-0.5")).toEqual({ negative: true, magnitude: 5n, scale: 1 });
  });

  test("assetValueScaled6 is amount * price / 10^decimals at 6 USD decimals", () => {
    // 1.5 USDC (6 decimals) at price 2 = 3.000000 USD
    expect(assetValueScaled6(1_500_000n, 6, "2")).toBe(3_000_000n);
    // 1e9 tokens (9 decimals) at 123.456789 = 123456789000 USD exactly
    expect(assetValueScaled6(1_000_000_000_000_000_000n, 9, "123.456789")).toBe(
      123_456_789_000_000_000n,
    );
  });

  test("assetValueScaled6 floors the sixth decimal and lets dust vanish", () => {
    // 0.0000015 USD floors to 0.000001
    expect(assetValueScaled6(1n, 0, "0.0000015")).toBe(1n);
    // 0.0000004 USD floors to zero
    expect(assetValueScaled6(1n, 6, "0.4")).toBe(0n);
  });

  test("toScaled6 converts signed equity at any scale, flooring toward negative infinity", () => {
    expect(toScaled6("12.5")).toBe(12_500_000n);
    expect(toScaled6("-12.5")).toBe(-12_500_000n);
    expect(toScaled6("0.0000005")).toBe(0n);
    expect(toScaled6("-0.0000005")).toBe(-1n);
  });

  test("formatUsd renders exactly six decimals with sign", () => {
    expect(formatUsd(0n)).toBe("0.000000");
    expect(formatUsd(1n)).toBe("0.000001");
    expect(formatUsd(123_456_789_000_000_000n)).toBe("123456789000.000000");
    expect(formatUsd(-12_500_000n)).toBe("-12.500000");
  });
});
