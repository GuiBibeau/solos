// @ts-check
import { describe, expect, test } from "bun:test";
import { hasNonZeroSpotCollateral, nonZeroSpotCollateralCount } from "./phoenix-spot-collateral.js";

/** The exact row the live trader-state API returns for every trader that holds no spot balance. */
const LIVE_ZERO_SOL = {
  assetIndex: 4_294_901_760,
  symbol: "SOL",
  balance: "0",
  decimals: 9,
  maxBalance: "500000000000",
};

describe("phoenix spot collateral", () => {
  test("the live zero-balance SOL default is not exposure and is not counted", () => {
    expect(hasNonZeroSpotCollateral([LIVE_ZERO_SOL])).toBe(false);
    expect(nonZeroSpotCollateralCount([LIVE_ZERO_SOL])).toBe(0);
  });

  test("an absent or empty array is not exposure and is not counted", () => {
    expect(hasNonZeroSpotCollateral([])).toBe(false);
    expect(nonZeroSpotCollateralCount([])).toBe(0);
    expect(nonZeroSpotCollateralCount(undefined)).toBe(0);
  });

  test("a nonzero balance is exposure and is counted, ignoring zero rows beside it", () => {
    expect(hasNonZeroSpotCollateral([{ balance: "1" }])).toBe(true);
    expect(hasNonZeroSpotCollateral([LIVE_ZERO_SOL, { balance: "250000" }])).toBe(true);
    expect(nonZeroSpotCollateralCount([LIVE_ZERO_SOL, { balance: "250000" }])).toBe(1);
  });

  test("a balance that cannot be proven zero fails closed", () => {
    expect(hasNonZeroSpotCollateral([{ balance: 0 }])).toBe(true);
    expect(hasNonZeroSpotCollateral([{ symbol: "SOL" }])).toBe(true);
    expect(hasNonZeroSpotCollateral([null])).toBe(true);
    expect(nonZeroSpotCollateralCount([{ balance: "1.0" }])).toBe(1);
  });
});
