import { describe, expect, test } from "bun:test";
import { MARKET, OWNER, USDC } from "./action.fixtures.js";
import { PortfolioStateSchema } from "./index.js";

const token = {
  kind: "token",
  protocol: null,
  instrument: USDC,
  amount: "1",
  decimals: 6,
  valueUsd: null,
};
const lend = { ...token, kind: "lend", protocol: "kamino", market: MARKET, positions: [OWNER] };
const lp = {
  kind: "lp",
  protocol: "orca",
  position: OWNER,
  instrument: MARKET,
  liquidity: "1",
  tokenA: { mint: USDC, amount: "1", decimals: 6 },
  tokenB: { mint: OWNER, amount: "0", decimals: 9 },
  valueUsd: null,
};
const portfolio = { owner: OWNER, valuationUsd: "100", cash: [], positions: [], at: 1 };

describe("Portfolio unknown valuation", () => {
  test("unknown nonzero cash and positions require a null aggregate", () => {
    for (const change of [
      { cash: [token] },
      { positions: [token] },
      { positions: [lend] },
      { positions: [lp] },
    ]) {
      expect(PortfolioStateSchema.safeParse({ ...portfolio, ...change }).success).toBe(false);
      expect(
        PortfolioStateSchema.safeParse({ ...portfolio, ...change, valuationUsd: null }).success,
      ).toBe(true);
    }
  });

  test("unknown account equity requires null even without open perp positions", () => {
    const state = {
      ...portfolio,
      perpAccounts: [{ protocol: "phoenix", account: OWNER, equityUsd: null }],
    };
    expect(PortfolioStateSchema.safeParse(state).success).toBe(false);
    expect(PortfolioStateSchema.safeParse({ ...state, valuationUsd: null }).success).toBe(true);
  });

  test("known equity allows null per-market perp value and signed totals", () => {
    const state = {
      ...portfolio,
      valuationUsd: "-10",
      positions: [{ ...token, kind: "perp", protocol: "phoenix", account: OWNER, side: "short" }],
      perpAccounts: [{ protocol: "phoenix", account: OWNER, equityUsd: "-10" }],
    };
    expect(PortfolioStateSchema.parse(state)).toEqual(state);
  });

  test("zero principal does not make the aggregate unknown", () => {
    const positions = [
      { ...token, amount: "0" },
      { ...lend, amount: "000" },
      { ...lp, tokenA: { ...lp.tokenA, amount: "0" } },
    ];
    expect(
      PortfolioStateSchema.safeParse({ ...portfolio, positions, valuationUsd: "0" }).success,
    ).toBe(true);
  });

  test("known nonzero values allow a reported total", () => {
    expect(
      PortfolioStateSchema.safeParse({
        ...portfolio,
        positions: [{ ...token, valueUsd: "100" }],
      }).success,
    ).toBe(true);
  });
});
