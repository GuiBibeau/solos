// @ts-check
import { describe, expect, test } from "bun:test";
import { PortfolioStateSchema } from "@solos-sh/actions";
import { assembleState, mintsToPrice } from "./assemble.js";
import {
  balance,
  compareString,
  DOG,
  identityOf,
  isSorted,
  lendPosition,
  lpPosition,
  OWNER,
  perpAccount,
  perpPosition,
  prices,
  USDC,
  venues,
  WSOL,
} from "./fixtures.js";

describe("portfolio mintsToPrice", () => {
  test("collects SOL as wSOL, nonzero wallet tokens, lend instruments and LP underlyings", () => {
    const mints = mintsToPrice({
      lamports: 1_000_000_000n,
      tokenBalances: [
        balance({ mint: USDC, account: "a", amount: "5" }),
        balance({ mint: DOG, account: "b", amount: "0" }),
      ],
      venues: venues({
        lend: { positions: [lendPosition], perpAccounts: [], receiptMints: [] },
        liquidity: { positions: [lpPosition], perpAccounts: [], receiptMints: [] },
      }),
    });
    expect(mints).toEqual([DOG, USDC, WSOL].toSorted(compareString));
  });
});

describe("venue assembly", () => {
  test("venues contribute positions; per-market perp value stays null and equity counts once", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 1_000_000_000n,
      tokenBalances: [],
      venues: venues({
        lend: { positions: [lendPosition], perpAccounts: [], receiptMints: [USDC] },
        perp: { positions: [perpPosition], perpAccounts: [perpAccount], receiptMints: [] },
      }),
      prices: prices([WSOL, "100"], [USDC, "1"]),
      at: 5,
    });
    expect(state.positions.map((entry) => entry.kind)).toEqual(["lend", "perp"]);
    expect(state.positions[1].valueUsd).toBe(null);
    expect(state.perpAccounts).toEqual([perpAccount]);
    expect(state.valuationUsd).toBe("113.500000");
  });

  test("LP value needs both underlying prices; a missing one nulls the valuation", () => {
    const args = {
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [],
      venues: venues({
        liquidity: { positions: [lpPosition], perpAccounts: [], receiptMints: [] },
      }),
      at: 5,
    };
    const both = assembleState({ ...args, prices: prices([USDC, "1"], [DOG, "2"]) });
    expect(both.valuationUsd).toBe("2.500000");
    const one = assembleState({ ...args, prices: prices([USDC, "1"]) });
    expect(one.positions[0].valueUsd).toBe(null);
    expect(one.valuationUsd).toBe(null);
  });

  test("long and short positions share one trader-account equity observation", () => {
    const shortPosition = {
      ...perpPosition,
      instrument: "BTC",
      side: /** @type {"short"} */ ("short"),
    };
    const state = assembleState({
      owner: OWNER,
      lamports: 0n,
      tokenBalances: [],
      venues: venues({
        perp: {
          positions: [perpPosition, shortPosition],
          perpAccounts: [perpAccount],
          receiptMints: [],
        },
      }),
      prices: new Map(),
      at: 5,
    });
    expect(state.perpAccounts).toEqual([perpAccount]);
    expect(state.positions.map((entry) => entry.side)).toEqual(["short", "long"]); // BTC < SOL
    expect(() => PortfolioStateSchema.parse(state)).not.toThrow();
  });

  test("output is sorted deterministically and validates against the published schema", () => {
    const state = assembleState({
      owner: OWNER,
      lamports: 1_000_000_000n,
      tokenBalances: [],
      venues: venues({
        lend: { positions: [lendPosition], perpAccounts: [], receiptMints: [] },
        perp: { positions: [perpPosition], perpAccounts: [perpAccount], receiptMints: [] },
        liquidity: { positions: [lpPosition], perpAccounts: [], receiptMints: [] },
      }),
      prices: prices([WSOL, "100"], [USDC, "1"], [DOG, "2"]),
      at: 5,
    });
    expect(isSorted(state.cash.map(identityOf))).toBe(true);
    expect(isSorted(state.positions.map(identityOf))).toBe(true);
    expect(() => PortfolioStateSchema.parse(state)).not.toThrow();
    expect(state.valuationUsd).toBe("116.000000"); // 100 SOL + 1 lend + 2.5 LP + 12.5 equity
  });
});
