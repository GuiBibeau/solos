// @ts-check
import { describe, expect, test } from "bun:test";
import { collateralToLiquidity, decimalRatio } from "./kamino-position-math.js";

describe("Kamino collateral conversion", () => {
  test("parses plain and scientific rates as exact ratios", () => {
    expect(decimalRatio("0.5")).toEqual({ numerator: 5n, denominator: 10n });
    expect(decimalRatio("1.25e-2")).toEqual({ numerator: 125n, denominator: 10_000n });
    expect(decimalRatio("2e3")).toEqual({ numerator: 2000n, denominator: 1n });
  });

  test("aggregated collateral divides once and floors the final remainder", () => {
    expect(collateralToLiquidity(151n, "0.5")).toBe(302n);
    expect(collateralToLiquidity(10n, "3")).toBe(3n);
    expect(collateralToLiquidity(18_446_744_073_709_551_615n, "1.25")).toBe(
      14_757_395_258_967_641_292n,
    );
  });
});
