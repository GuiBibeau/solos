// @ts-check
import { describe, expect, test } from "bun:test";
import { PortfolioStateSchema } from "@solos-sh/actions";
import { assembleState } from "./assemble.js";
import {
  balance,
  DOG,
  identityOf,
  isSorted,
  OWNER,
  prices,
  USDC,
  venues,
  WSOL,
} from "./fixtures.js";

describe("portfolio assembly", () => {
  test("native SOL and stablecoins are cash; wSOL and other tokens are positions", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 2_000_000_000n,
      tokenBalances: [
        balance({ mint: USDC, account: "a", amount: "5" }),
        balance({ mint: WSOL, account: "b", amount: "300000000", decimals: 9 }),
      ],
      venues: venues(),
      prices: prices([WSOL, "100"], [USDC, "1"]),
      at: 5,
    });
    expect(state.cash.map((entry) => entry.instrument)).toEqual([USDC, "SOL"]);
    expect(state.positions.map((entry) => entry.instrument)).toEqual([WSOL]);
    const solCash = state.cash.find((entry) => entry.instrument === "SOL");
    expect(solCash).toMatchObject({ amount: "2000000000", decimals: 9, protocol: null });
  });

  test("duplicate token accounts count once; distinct accounts of one mint sum", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [
        balance({ mint: DOG, account: "a", amount: "100000000" }),
        balance({ mint: DOG, account: "a", amount: "100000000" }),
        balance({ mint: DOG, account: "b", amount: "50000000" }),
      ],
      venues: venues(),
      prices: prices([DOG, "2"]),
      at: 5,
    });
    expect(state.positions[0].amount).toBe("150000000");
    expect(state.valuationUsd).toBe("300.000000");
  });

  test("receipt mints from successful venue reads are excluded from wallet holdings", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [balance({ mint: DOG, account: "a", amount: "100" })],
      venues: venues({
        liquidity: { positions: [], perpAccounts: [], receiptMints: [DOG] },
      }),
      prices: prices([DOG, "2"]),
      at: 5,
    });
    expect(state.positions).toEqual([]);
  });

  test("zero-balance tokens drop; zero lamports keep a zero SOL cash entry", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [balance({ mint: DOG, account: "a", amount: "0" })],
      venues: venues(),
      prices: new Map(),
      at: 5,
    });
    expect(state.cash.map((entry) => entry.instrument)).toEqual(["SOL"]);
    expect(state.positions).toEqual([]);
    expect(state.valuationUsd).toBe("0.000000");
  });

  test("an unpriced nonzero holding nulls its value and the valuation; priced stablecoins are observed", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [
        balance({ mint: USDC, account: "a", amount: "1000000" }),
        balance({ mint: DOG, account: "b", amount: "7" }),
      ],
      venues: venues(),
      prices: prices([USDC, "0.999123"]),
      at: 5,
    });
    expect(state.cash[0].valueUsd).toBe("0.999123");
    expect(state.positions[0].valueUsd).toBe(null);
    expect(state.valuationUsd).toBe(null);
  });

  test("output is sorted deterministically and validates against the published schema", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 1_000_000_000n,
      tokenBalances: [],
      venues: venues(),
      prices: prices([WSOL, "100"]),
      at: 5,
    });
    expect(isSorted(state.cash.map(identityOf))).toBe(true);
    expect(
      isSorted(state.perpAccounts.map((account) => `${account.protocol}/${account.account}`)),
    ).toBe(true);
    expect(() => PortfolioStateSchema.parse(state)).not.toThrow();
    expect(state.valuationUsd).toBe("100.000000");
  });

  test("an empty wallet returns the published schema with a zero valuation", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [],
      venues: venues(),
      prices: new Map(),
      at: 5,
    });
    expect(() => PortfolioStateSchema.parse(state)).not.toThrow();
    expect(state.valuationUsd).toBe("0.000000");
    expect(state.owner).toBe(OWNER);
    expect(state.at).toBe(5);
  });
});
