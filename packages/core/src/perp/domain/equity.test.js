// @ts-check
import { describe, expect, test } from "bun:test";
import { equityUsdFromSubaccount } from "./equity.js";

describe("equityUsdFromSubaccount", () => {
  test("a cold or absent trader is a confirmed zero, never a guess", () => {
    expect(
      equityUsdFromSubaccount({ collateral: 0n, openPositionCount: 0, spotCollateralCount: 0 }),
    ).toBe("0");
  });

  test("an active flat account is worth exactly its collateral", () => {
    expect(
      equityUsdFromSubaccount({ collateral: 250000000n, openPositionCount: 0, spotCollateralCount: 0 }),
    ).toBe("250");
  });

  test("any open position makes equity null: unrealized PnL is unknowable", () => {
    expect(
      equityUsdFromSubaccount({ collateral: 250000000n, openPositionCount: 1, spotCollateralCount: 0 }),
    ).toBe(null);
  });

  test("any spot collateral makes equity null: it is valued off-snapshot", () => {
    expect(
      equityUsdFromSubaccount({ collateral: 250000000n, openPositionCount: 0, spotCollateralCount: 2 }),
    ).toBe(null);
  });

  test("equity is signed: negative collateral survives exactly", () => {
    expect(
      equityUsdFromSubaccount({ collateral: -1n, openPositionCount: 0, spotCollateralCount: 0 }),
    ).toBe("-0.000001");
  });
});
