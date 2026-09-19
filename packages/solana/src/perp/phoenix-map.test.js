// @ts-check
import { describe, expect, test } from "bun:test";
import {
  PerpAccountCorrupt,
  PerpEnumerationIncomplete,
  PerpPositionSchema,
  PerpStateIncomplete,
} from "@solos/core";
import { PHOENIX_PERPS_PROGRAM, RISE_REVISION, RISE_SDK_VERSION } from "./phoenix-api.js";
import { mapEnumeration, mapPointRead } from "./phoenix-map.js";
import {
  DEFAULT_AUTHORITY,
  OTHER_AUTHORITY,
  coldState,
  flatState,
  longState,
  marketConfig,
  multiMarketState,
  positionRow,
  shortState,
  subaccount,
  traderState,
} from "./phoenix-scenarios.js";

const SOL = marketConfig("SOL", 2);
const ETH = marketConfig("ETH", 3);

describe("pinned revisions (ADR-0021)", () => {
  test("the adapter pins the production program and the verified Rise revision", () => {
    expect(PHOENIX_PERPS_PROGRAM).toBe("EtrnLzgbS7nMMy5fbD42kXiUzGg8XQzJ972Xtk1cjWih");
    expect(RISE_REVISION).toBe("4bd3c505f16f09fdbe9fb2eff035aeaef8b7b12d");
    expect(RISE_SDK_VERSION).toBe("0.5.26");
  });
});

describe("mapPointRead", () => {
  test("a long carries the absolute amount, explicit side, and null valueUsd", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL,
      state: longState(),
    });
    expect(PerpPositionSchema.parse(position)).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: DEFAULT_AUTHORITY,
      instrument: "SOL",
      side: "long",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(account).toMatchObject({
      protocol: "phoenix",
      account: DEFAULT_AUTHORITY,
      equityUsd: null,
    });
  });

  test("a short keeps the direction in side, never in the amount", () => {
    const { position } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL,
      state: shortState(),
    });
    expect(position).toMatchObject({ side: "short", amount: "1500" });
  });

  test("flat is exactly zero, and a flat account is worth its collateral", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL,
      state: flatState(),
    });
    expect(position).toMatchObject({ side: "flat", amount: "0", valueUsd: null });
    expect(account.equityUsd).toBe("250");
  });

  test("a market with no row is typed flat even when other markets are open", () => {
    const { position } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: ETH,
      state: longState(),
    });
    expect(position).toMatchObject({ instrument: "ETH", side: "flat", amount: "0", decimals: 3 });
  });

  test("a cold, absent trader is flat with confirmed-zero equity", () => {
    const { position, account } = mapPointRead({
      authority: OTHER_AUTHORITY,
      market: SOL,
      state: coldState(OTHER_AUTHORITY),
    });
    expect(position).toMatchObject({ side: "flat", amount: "0" });
    expect(account).toMatchObject({ account: OTHER_AUTHORITY, equityUsd: "0" });
  });

  test("an authority echo mismatch is a corrupt account, not a position", () => {
    expect(() =>
      mapPointRead({
        authority: DEFAULT_AUTHORITY,
        market: SOL,
        state: longState(OTHER_AUTHORITY),
      }),
    ).toThrow(PerpAccountCorrupt);
  });

  test("a snapshot for another traderPdaIndex is a corrupt account", () => {
    const state = longState();
    state.traderPdaIndex = 1;
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL, state })).toThrow(
      PerpAccountCorrupt,
    );
  });

  test("subaccount zero is selected by value from an out-of-order array", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL,
      state: multiMarketState(),
    });
    expect(position).toMatchObject({ side: "long", amount: "1500" });
    expect(account.account).toBe(DEFAULT_AUTHORITY);
  });

  test("a snapshot without subaccount zero is incomplete state", () => {
    const state = traderState(DEFAULT_AUTHORITY, [subaccount(1)]);
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL, state })).toThrow(
      PerpStateIncomplete,
    );
  });

  test("malformed lot strings are a corrupt account, never zero", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { collateral: "250000000", positions: [positionRow("SOL", "15.0")] }),
    ]);
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL, state })).toThrow(
      PerpAccountCorrupt,
    );
  });

  test("market metadata without a lot size is incomplete state", () => {
    const state = longState();
    const bare = { ...SOL, baseLotsDecimals: undefined };
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: bare, state })).toThrow(
      PerpStateIncomplete,
    );
  });
});

describe("mapEnumeration", () => {
  test("multiple markets: one position each, one shared equity record, no receipt mints", () => {
    const { positions, perpAccounts, receiptMints } = mapEnumeration({
      authority: DEFAULT_AUTHORITY,
      markets: [SOL, ETH],
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
      markets: [SOL, ETH],
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
      markets: [SOL],
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

  test("a snapshot position in an unknown market fails the whole enumeration", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("DOGE", "5")] }),
    ]);
    expect(() => mapEnumeration({ authority: DEFAULT_AUTHORITY, markets: [SOL], state })).toThrow(
      PerpStateIncomplete,
    );
  });
});
