// @ts-check
import { describe, expect, test } from "bun:test";
import { collateralToLiquidity } from "./kamino-position-math.js";

describe("Kamino collateral conversion", () => {
  test("aggregated collateral multiplies by total supply, divides once, and floors", () => {
    expect(collateralToLiquidity(151n, "500", "1000")).toBe(302n);
    expect(collateralToLiquidity(10n, "3", "1")).toBe(3n);
    expect(collateralToLiquidity(18_446_744_073_709_551_615n, "5", "4")).toBe(
      14_757_395_258_967_641_292n,
    );
  });

  test("keeps the exact floor at the u64 boundary without a rounded exchange rate", () => {
    expect(
      collateralToLiquidity(
        13_389_617_171_941_807_350n,
        "16255895523639956555",
        "12663392048017480144",
      ),
    ).toBe(10_430_552_495_529_291_296n);
  });
});
