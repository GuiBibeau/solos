// @ts-check
import { describe, expect, test } from "bun:test";
import { PerpAccountCorrupt, PerpPositionSchema, PerpStateIncomplete } from "@solos/core";
import { mapPointRead } from "./phoenix-map.js";
import {
  DEFAULT_AUTHORITY,
  ETH_MARKET,
  OTHER_AUTHORITY,
  SOL_MARKET,
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

describe("mapPointRead", () => {
  test("a negative-lot market maps through the published position contract (PUMP at -2)", () => {
    const pumpMarket = marketConfig("PUMP", -2);
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("PUMP", "250")] }),
    ]);
    const { position } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: pumpMarket,
      state,
    });
    expect(position).toMatchObject({
      instrument: "PUMP",
      side: "long",
      amount: "250",
      decimals: -2,
    });
  });

  test("a long carries the absolute amount, explicit side, and null valueUsd", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL_MARKET,
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
      market: SOL_MARKET,
      state: shortState(),
    });
    expect(position).toMatchObject({ side: "short", amount: "1500" });
  });

  test("amount is the absolute exposure in base units; decimals scales it to tokens", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("SOL", "1")] }),
    ]);
    const { position } = mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL_MARKET, state });
    expect(position).toMatchObject({ side: "long", amount: "1", decimals: 2 });
  });

  test("a short of -1500 lots at 2 decimals is amount 1500 base units, side short", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { positions: [positionRow("SOL", "-1500")] }),
    ]);
    const { position } = mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL_MARKET, state });
    expect(position).toMatchObject({ side: "short", amount: "1500", decimals: 2 });
  });

  test("flat is exactly zero, and a flat account is worth its collateral", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL_MARKET,
      state: flatState(),
    });
    expect(position).toMatchObject({ side: "flat", amount: "0", valueUsd: null });
    expect(account.equityUsd).toBe("250");
  });

  test("a market with no row is typed flat even when other markets are open", () => {
    const { position } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: ETH_MARKET,
      state: longState(),
    });
    expect(position).toMatchObject({ instrument: "ETH", side: "flat", amount: "0", decimals: 3 });
  });

  test("a cold, absent trader is flat with confirmed-zero equity", () => {
    const { position, account } = mapPointRead({
      authority: OTHER_AUTHORITY,
      market: SOL_MARKET,
      state: coldState(OTHER_AUTHORITY),
    });
    expect(position).toMatchObject({ side: "flat", amount: "0" });
    expect(account).toMatchObject({ account: OTHER_AUTHORITY, equityUsd: "0" });
  });

  test("an authority echo mismatch is a corrupt account, not a position", () => {
    expect(() =>
      mapPointRead({
        authority: DEFAULT_AUTHORITY,
        market: SOL_MARKET,
        state: longState(OTHER_AUTHORITY),
      }),
    ).toThrow(PerpAccountCorrupt);
  });

  test("a snapshot for another traderPdaIndex is a corrupt account", () => {
    const state = longState();
    state.traderPdaIndex = 1;
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL_MARKET, state })).toThrow(
      PerpAccountCorrupt,
    );
  });

  test("subaccount zero is selected by value from an out-of-order array", () => {
    const { position, account } = mapPointRead({
      authority: DEFAULT_AUTHORITY,
      market: SOL_MARKET,
      state: multiMarketState(),
    });
    expect(position).toMatchObject({ side: "long", amount: "1500" });
    expect(account.account).toBe(DEFAULT_AUTHORITY);
  });

  test("a snapshot without subaccount zero is incomplete state", () => {
    const state = traderState(DEFAULT_AUTHORITY, [subaccount(1)]);
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL_MARKET, state })).toThrow(
      PerpStateIncomplete,
    );
  });

  test("malformed lot strings are a corrupt account, never zero", () => {
    const state = traderState(DEFAULT_AUTHORITY, [
      subaccount(0, { collateral: "250000000", positions: [positionRow("SOL", "15.0")] }),
    ]);
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: SOL_MARKET, state })).toThrow(
      PerpAccountCorrupt,
    );
  });

  test("market metadata without a lot size is incomplete state", () => {
    const state = longState();
    const bare = { ...SOL_MARKET, baseLotsDecimals: undefined };
    expect(() => mapPointRead({ authority: DEFAULT_AUTHORITY, market: bare, state })).toThrow(
      PerpStateIncomplete,
    );
  });
});
