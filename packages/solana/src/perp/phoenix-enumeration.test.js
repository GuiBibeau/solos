// @ts-check
import { describe, expect, test } from "bun:test";
import { PerpEnumerationIncomplete, PerpStateIncomplete } from "@solos/core";
import { mapEnumeration } from "./phoenix-map.js";
import {
  DEFAULT_AUTHORITY,
  ETH_MARKET,
  SOL_MARKET,
  flatState,
  marketConfig,
  multiMarketState,
  positionRow,
  subaccount,
  traderState,
} from "./phoenix-scenarios.js";

describe("mapEnumeration", () => {
  test("multiple markets: one position each, one shared equity record, no receipt mints", () => {
    const { positions, perpAccounts, receiptMints } = mapEnumeration({
      authority: DEFAULT_AUTHORITY,
      markets: [SOL_MARKET, ETH_MARKET],
      state: multiMarketState(),
    });
    expect(positions).toHaveLength(2);
    expect(positions[0]).toMatchObject({ instrument: "SOL", side: "long", amount: "1500" });
    expect(positions[1]).toMatchObject({
      instrument: "ETH",
      side: "short",
      amount: "1000",
      decimals: 3,
    });
    expect(perpAccounts).toEqual([
      { protocol: "phoenix", account: DEFAULT_AUTHORITY, equityUsd: null },
    ]);
    expect(receiptMints).toEqual([]);
  });

  test("a flat account still reports its equity exactly once", () => {
    const { positions, perpAccounts } = mapEnumeration({
      authority: DEFAULT_AUTHORITY,
      markets: [SOL_MARKET, ETH_MARKET],
      state: flatState(),
    });
    expect(positions).toEqual([]);
    expect(perpAccounts).toEqual([
      { protocol: "phoenix", account: DEFAULT_AUTHORITY, equityUsd: "250" },
    ]);
  });

  test("a residual zero-lots row is neither a position nor an equity mystery", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("SOL", "0")] }),
    ]);
    const { positions, perpAccounts } = mapEnumeration({
      authority: DEFAULT_AUTHORITY,
      markets: [SOL_MARKET],
      state,
    });
    expect(positions).toEqual([]);
    expect(perpAccounts[0]?.equityUsd).toBe("250");
  });

  test("crossing the position bound fails instead of returning a partial list", () => {
    const rows = Array.from({ length: 257 }, (_, index) => positionRow(`M${index}`, "1"));
    const state = traderState(DEFAULT_AUTHORITY, [subaccount(0, { positions: rows })]);
    const markets = rows.map((row) => marketConfig(row.symbol, 2));
    expect(() => mapEnumeration({ authority: DEFAULT_AUTHORITY, markets, state })).toThrow(
      PerpEnumerationIncomplete,
    );
  });

  test("the row bound counts zero-lot rows too: 257 rows with a residual zero row fail", () => {
    const rows = Array.from({ length: 257 }, (_, index) => positionRow(`M${index}`, "1"));
    rows[256] = positionRow("SOL", "0");
    const state = traderState(DEFAULT_AUTHORITY, [subaccount(0, { positions: rows })]);
    const markets = rows.map((row) => marketConfig(row.symbol, 2));
    expect(() => mapEnumeration({ authority: DEFAULT_AUTHORITY, markets, state })).toThrow(
      PerpEnumerationIncomplete,
    );
  });

  test("a snapshot position in an unknown market fails the whole enumeration", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("DOGE", "5")] }),
    ]);
    expect(() =>
      mapEnumeration({ authority: DEFAULT_AUTHORITY, markets: [SOL_MARKET], state }),
    ).toThrow(PerpStateIncomplete);
  });
});
