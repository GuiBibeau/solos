// @ts-check
import { describe, expect, test } from "bun:test";
import { MarketsListSchema } from "./phoenix-wire.js";

describe("markets wire", () => {
  test("a lot size smaller than one token is a valid market (negative decimals)", () => {
    const markets = [{ symbol: "PUMP", baseLotsDecimals: -2 }];
    expect(MarketsListSchema.parse(markets)).toEqual(markets);
  });

  test("fractional decimals are still a broken envelope", () => {
    expect(MarketsListSchema.safeParse([{ symbol: "PUMP", baseLotsDecimals: -0.5 }]).success).toBe(
      false,
    );
  });
});
