// @ts-check
import { describe, expect, test } from "bun:test";
import { PerpStateIncomplete } from "./errors.js";
import {
  GetFundingInputSchema,
  aprFundingPct,
  fundingMarketLabel,
  hourlyFundingPct,
} from "./funding.js";

describe("funding percent scaling", () => {
  test("a one-hour interval is already the hourly percent, and APR is 24 * 365 hours", () => {
    expect(hourlyFundingPct("0.001758", 3600)).toBe("0.001758");
    expect(aprFundingPct("0.001758")).toBe("15.40008");
    expect(hourlyFundingPct("0.003", 3600)).toBe("0.003");
    expect(aprFundingPct("0.003")).toBe("26.28");
  });

  test("a shorter interval scales up to an hourly percent and keeps the sign", () => {
    expect(hourlyFundingPct("0.001758", 1800)).toBe("0.003516");
    expect(hourlyFundingPct("-0.004", 3600)).toBe("-0.004");
    expect(aprFundingPct("-0.004")).toBe("-35.04");
    expect(fundingMarketLabel("SOL")).toBe("SOL-PERP");
  });

  test("a missing lookback defaults to 24 and a rate that is not a decimal is incomplete", () => {
    expect(GetFundingInputSchema.parse({ market: "SOL" }).lookbackHours).toBe(24);
    expect(GetFundingInputSchema.safeParse({ market: "SOL", lookbackHours: 0 }).success).toBe(
      false,
    );
    expect(GetFundingInputSchema.safeParse({ market: "SOL", lookbackHours: 169 }).success).toBe(
      false,
    );
    expect(() => hourlyFundingPct("fast", 3600)).toThrow(PerpStateIncomplete);
  });
});
