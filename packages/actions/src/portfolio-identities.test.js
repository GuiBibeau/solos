import { describe, expect, test } from "bun:test";
import { MARKET, OWNER, USDC } from "./action.fixtures.js";
import { PortfolioStateSchema } from "./index.js";

const token = {
  kind: "token",
  instrument: USDC,
  amount: "100",
  decimals: 6,
  valueUsd: null,
  protocol: null,
};
const lend = { ...token, kind: "lend", protocol: "kamino", market: MARKET, positions: [OWNER] };
const perp = {
  ...token,
  kind: "perp",
  protocol: "phoenix",
  account: OWNER,
  instrument: "SOL-PERP",
  side: "short",
};
const lp = {
  kind: "lp",
  protocol: "orca",
  instrument: MARKET,
  position: OWNER,
  liquidity: "100",
  tokenA: { mint: USDC, amount: "100", decimals: 6 },
  tokenB: { mint: OWNER, amount: "0", decimals: 9 },
  valueUsd: null,
};
const portfolio = {
  owner: OWNER,
  valuationUsd: null,
  cash: [],
  positions: [],
  perpAccounts: [OWNER, MARKET].map((account) => ({
    protocol: "phoenix",
    account,
    equityUsd: null,
  })),
  at: 1,
};

describe("Portfolio identity uniqueness", () => {
  test("repeated identities are rejected even when their reported exposure differs", () => {
    for (const position of [token, lend, perp, lp]) {
      expect(
        PortfolioStateSchema.safeParse({
          ...portfolio,
          positions: [position, { ...position, amount: "200", liquidity: "200" }],
        }).success,
      ).toBe(false);
    }
  });

  test("cash cannot duplicate a token internally or across positions", () => {
    for (const change of [
      { cash: [token, token] },
      { cash: [token], positions: [{ ...token, protocol: "spl-token" }] },
    ]) {
      expect(PortfolioStateSchema.safeParse({ ...portfolio, ...change }).success).toBe(false);
    }
  });

  test("distinct markets, trader accounts and LP accounts preserve separate exposure", () => {
    const positions = [
      token,
      { ...token, instrument: "SOL" },
      lend,
      { ...lend, market: OWNER },
      { ...lend, instrument: OWNER },
      perp,
      { ...perp, instrument: "BTC-PERP" },
      { ...perp, account: MARKET },
      lp,
      { ...lp, position: MARKET },
      { ...lp, protocol: "meteora" },
    ];
    expect(PortfolioStateSchema.parse({ ...portfolio, positions }).positions).toEqual(positions);
  });
});
