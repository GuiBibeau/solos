// @ts-check
import { describe, expect, test } from "bun:test";
import { exactCollateralForWithdrawal } from "./kamino-withdraw-math.js";

describe("Kamino exact withdrawal conversion", () => {
  test("finds the smallest collateral amount whose floored redemption equals the request", () => {
    expect(exactCollateralForWithdrawal(3n, "1.5")).toBe(5n);
    expect(exactCollateralForWithdrawal(10n, "2")).toBe(20n);
  });

  test("rejects a request that cannot be represented exactly by whole cTokens", () => {
    expect(exactCollateralForWithdrawal(1n, "0.5")).toBeNull();
    expect(exactCollateralForWithdrawal(2n, "0.5")).toBe(1n);
  });

  test("keeps large and scientific rates exact without JS floats", () => {
    expect(exactCollateralForWithdrawal(10_000_000_000_000_000_001n, "1e-1")).toBeNull();
    expect(exactCollateralForWithdrawal(10_000_000_000_000_000_000n, "1e-1")).toBe(
      1_000_000_000_000_000_000n,
    );
  });
});
