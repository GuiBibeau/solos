// @ts-check
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { startPhoenixFixture } from "./phoenix-fixture.js";
import {
  DEFAULT_AUTHORITY,
  OTHER_AUTHORITY,
  coldState,
  flatState,
  longState,
  multiMarketState,
  shortState,
} from "./phoenix-scenarios.js";
import { listThrough, readThrough } from "./phoenix-through.js";

describe("PerpVenueLive position reads through the loopback Phoenix fixture [integration]", () => {
  /** @type {ReturnType<typeof startPhoenixFixture>} */
  let fixture;

  afterEach(() => fixture?.stop());
  afterAll(() => fixture?.stop());

  test("a long reads side, absolute amount, decimals, and null valueUsd", async () => {
    fixture = startPhoenixFixture({ trader: longState() });
    const result = await readThrough(fixture, { market: "SOL", owner: DEFAULT_AUTHORITY });
    expect(result.position).toMatchObject({
      kind: "perp",
      protocol: "phoenix",
      account: DEFAULT_AUTHORITY,
      instrument: "SOL",
      side: "long",
      amount: "1500",
      decimals: 2,
      valueUsd: null,
    });
    expect(result.account).toMatchObject({ account: DEFAULT_AUTHORITY, equityUsd: null });
  });

  test("a short keeps direction in the side with a positive absolute amount", async () => {
    fixture = startPhoenixFixture({ trader: shortState() });
    const result = await readThrough(fixture, { market: "SOL", owner: DEFAULT_AUTHORITY });
    expect(result.position).toMatchObject({ side: "short", amount: "1500" });
  });

  test("an active but flat trader is a typed flat position with exact collateral equity", async () => {
    fixture = startPhoenixFixture({ trader: flatState() });
    const result = await readThrough(fixture, { market: "SOL", owner: DEFAULT_AUTHORITY });
    expect(result.position).toMatchObject({ side: "flat", amount: "0" });
    expect(result.account.equityUsd).toBe("250");
  });

  test("a valid market with no registered trader is zero-position success, not an error", async () => {
    fixture = startPhoenixFixture({ trader: (authority) => coldState(authority) });
    const result = await readThrough(fixture, { market: "SOL", owner: OTHER_AUTHORITY });
    expect(result.position).toMatchObject({
      instrument: "SOL",
      side: "flat",
      amount: "0",
      account: OTHER_AUTHORITY,
    });
    expect(result.account).toMatchObject({ account: OTHER_AUTHORITY, equityUsd: "0" });
  });

  test("the request shape pins the account scope: explicit index, encoded authority", async () => {
    fixture = startPhoenixFixture({ trader: (authority) => coldState(authority) });
    await readThrough(fixture, { market: "SOL", owner: OTHER_AUTHORITY });
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0]).toMatchObject({ path: "/v1/view/exchange/market/SOL" });
    expect(fixture.requests[1]).toMatchObject({
      path: `/v1/trader/state/${OTHER_AUTHORITY}`,
      query: { traderPdaIndex: "0" },
    });
  });

  test("an explicit owner is honored verbatim on the wire and echoed in the result", async () => {
    fixture = startPhoenixFixture({ trader: (authority) => coldState(authority) });
    const result = await readThrough(fixture, { market: "SOL", owner: OTHER_AUTHORITY });
    expect(fixture.requests[1]?.path).toBe(`/v1/trader/state/${OTHER_AUTHORITY}`);
    expect(result.position.account).toBe(OTHER_AUTHORITY);
  });

  test("enumeration covers multiple markets with one shared equity record", async () => {
    fixture = startPhoenixFixture({ trader: multiMarketState() });
    const enumeration = await listThrough(fixture, DEFAULT_AUTHORITY);
    expect(enumeration.positions).toHaveLength(2);
    expect(enumeration.positions[0]).toMatchObject({ instrument: "SOL", side: "long" });
    expect(enumeration.positions[1]).toMatchObject({
      instrument: "ETH",
      side: "short",
      amount: "1000",
    });
    expect(enumeration.perpAccounts).toEqual([
      { protocol: "phoenix", account: DEFAULT_AUTHORITY, equityUsd: null },
    ]);
    expect(enumeration.receiptMints).toEqual([]);
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.requests[0]?.path).toBe("/v1/view/exchange/markets");
  });

  test("enumeration of a flat account still carries the equity exactly once", async () => {
    fixture = startPhoenixFixture({ trader: flatState() });
    const enumeration = await listThrough(fixture, DEFAULT_AUTHORITY);
    expect(enumeration.positions).toEqual([]);
    expect(enumeration.perpAccounts).toEqual([
      { protocol: "phoenix", account: DEFAULT_AUTHORITY, equityUsd: "250" },
    ]);
  });
});
