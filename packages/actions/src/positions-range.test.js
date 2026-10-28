// @ts-check
import { describe, expect, test } from "bun:test";
import { MARKET, OWNER, USDC } from "./action.fixtures.js";
import { LpPositionSchema } from "./positions.js";

const base = {
  kind: "lp",
  protocol: "orca",
  instrument: MARKET,
  position: OWNER,
  liquidity: "1",
  tokenA: { mint: USDC, amount: "1", decimals: 6 },
  tokenB: { mint: OWNER, amount: "0", decimals: 9 },
  valueUsd: null,
};

describe("LpPosition range", () => {
  test("a position without range still parses", () => {
    expect(LpPositionSchema.parse(base)).toEqual(base);
    expect(LpPositionSchema.parse({ ...base, protocol: "meteora", liquidity: "1" })).toMatchObject({
      protocol: "meteora",
    });
  });

  test("meteora carries bin ids and orca and raydium carry tick indexes", () => {
    const bins = { lowerBinId: -2, upperBinId: 3 };
    const ticks = { tickLower: -1000, tickUpper: 1000 };
    expect(LpPositionSchema.parse({ ...base, protocol: "meteora", range: bins }).range).toEqual(
      bins,
    );
    expect(LpPositionSchema.parse({ ...base, protocol: "orca", range: ticks }).range).toEqual(
      ticks,
    );
    expect(LpPositionSchema.parse({ ...base, protocol: "raydium", range: ticks }).range).toEqual(
      ticks,
    );
  });

  test("a range that does not match the protocol is rejected", () => {
    const bins = { lowerBinId: 0, upperBinId: 1 };
    const ticks = { tickLower: 0, tickUpper: 1 };
    expect(LpPositionSchema.safeParse({ ...base, protocol: "meteora", range: ticks }).success).toBe(
      false,
    );
    expect(LpPositionSchema.safeParse({ ...base, protocol: "orca", range: bins }).success).toBe(
      false,
    );
    expect(
      LpPositionSchema.safeParse({
        ...base,
        protocol: "raydium",
        range: { ...bins, ...ticks },
      }).success,
    ).toBe(false);
  });
});
