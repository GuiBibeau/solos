import { describe, expect, test } from "bun:test";
import { MARKET, OWNER, USDC } from "./action.fixtures.js";
import { PerpAccountSchema, PortfolioStateSchema, PositionSchema } from "./index.js";

const token = {
  kind: "token",
  instrument: USDC,
  amount: "9007199254740993",
  decimals: 6,
  valueUsd: null,
  protocol: null,
};
const perp = {
  kind: "perp",
  protocol: "phoenix",
  instrument: "SOL-PERP",
  account: OWNER,
  side: "short",
  amount: "1000",
  decimals: 9,
  valueUsd: null,
};
const lp = {
  kind: "lp",
  protocol: "orca",
  instrument: MARKET,
  position: OWNER,
  liquidity: "340282366920938463463374607431768211455",
  tokenA: { mint: USDC, amount: "100", decimals: 6 },
  tokenB: { mint: OWNER, amount: "0", decimals: 9 },
  valueUsd: null,
};

describe("Position identities and valuation units", () => {
  test("wallet tokens retain their existing shape and exact quantities", () => {
    expect(PositionSchema.parse(token)).toEqual(token);
    expect(PositionSchema.parse({ ...token, protocol: "spl-token" })).toMatchObject({
      protocol: "spl-token",
    });
    expect(PositionSchema.parse({ ...token, instrument: "SOL", decimals: 9 })).toMatchObject({
      instrument: "SOL",
    });
  });

  test("lend quantities identify the configured market and contributing obligations", () => {
    const lend = { ...token, kind: "lend", protocol: "kamino", market: MARKET, positions: [OWNER] };
    expect(PositionSchema.parse(lend)).toEqual(lend);
    expect(PositionSchema.safeParse({ ...lend, positions: [OWNER, OWNER] }).success).toBe(false);
    expect(PositionSchema.safeParse({ ...lend, market: undefined }).success).toBe(false);
    expect(PositionSchema.safeParse({ ...lend, positions: [] }).success).toBe(false);
    expect(PositionSchema.safeParse({ ...lend, amount: "0", positions: [] }).success).toBe(true);
  });

  test("perp lot decimals may be negative: a lot smaller than one token is representable", () => {
    // Phoenix lists markets like PUMP with baseLotsDecimals -2 (one lot = 0.01 tokens).
    expect(PositionSchema.safeParse({ ...perp, decimals: -2 }).success).toBe(true);
    expect(PositionSchema.safeParse({ ...perp, decimals: -0.5 }).success).toBe(false);
  });

  test("shorts preserve direction and flat requires exactly zero size", () => {
    expect(PositionSchema.parse(perp)).toEqual(perp);
    expect(PositionSchema.safeParse({ ...perp, side: "flat", amount: "0" }).success).toBe(true);
    for (const change of [
      { side: "flat" },
      { amount: "0" },
      { amount: "-1000" },
      { valueUsd: "99999" },
    ]) {
      expect(PositionSchema.safeParse({ ...perp, ...change }).success).toBe(false);
    }
  });

  test("account equity accepts losses and unknown values rather than unsigned notional", () => {
    for (const equityUsd of ["-12.345678", "0", null]) {
      expect(
        PerpAccountSchema.parse({ protocol: "phoenix", account: OWNER, equityUsd }).equityUsd,
      ).toBe(equityUsd);
    }
  });

  test("LP identity and underlying quantities cannot be replaced by scalar token size", () => {
    expect(PositionSchema.parse(lp)).toEqual(lp);
    const aggregate = {
      ...lp,
      protocol: "meteora",
      liquidity: "340282366920938463463374607431768211456",
    };
    expect(PositionSchema.parse(aggregate)).toEqual(aggregate);
    for (const change of [
      { position: undefined },
      { tokenA: undefined },
      { liquidity: "340282366920938463463374607431768211456" },
      { liquidity: "bad" },
    ]) {
      expect(PositionSchema.safeParse({ ...lp, ...change }).success).toBe(false);
    }
  });

  test("portfolio holds market exposures separately from account equity", () => {
    const portfolio = {
      owner: OWNER,
      valuationUsd: null,
      cash: [token],
      positions: [perp, lp],
      perpAccounts: [{ protocol: "phoenix", account: OWNER, equityUsd: "-1" }],
      at: 1,
    };
    expect(PortfolioStateSchema.parse(portfolio)).toEqual(portfolio);
    expect(
      PortfolioStateSchema.parse({ ...portfolio, positions: [lp], perpAccounts: undefined })
        .perpAccounts,
    ).toEqual([]);
    for (const change of [
      { perpAccounts: [] },
      { perpAccounts: [...portfolio.perpAccounts, ...portfolio.perpAccounts] },
      { cash: [perp] },
    ]) {
      expect(PortfolioStateSchema.safeParse({ ...portfolio, ...change }).success).toBe(false);
    }
  });
});
