// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { startPhoenixFixture, SECRET_MARKER } from "./phoenix-fixture.js";
import { readFailure, listFailure } from "./phoenix-through.js";
import {
  DEFAULT_AUTHORITY,
  longState,
  marketConfig,
  positionRow,
  subaccount,
  traderState,
} from "./phoenix-scenarios.js";

const REQUEST = { market: "SOL", owner: DEFAULT_AUTHORITY };

describe("PerpVenueLive failure mapping through the loopback Phoenix fixture [integration]", () => {
  /** @type {ReturnType<typeof startPhoenixFixture>} */
  let fixture;

  afterEach(() => fixture?.stop());

  test("an unknown market is a distinct typed error before any account work", async () => {
    fixture = startPhoenixFixture({ trader: longState() });
    const failure = await readFailure(fixture, { market: "DOGE", owner: DEFAULT_AUTHORITY });
    expect(failure).toMatchObject({ _tag: "PerpMarketUnknown", market: "DOGE" });
    expect(fixture.requests).toHaveLength(1);
  });

  test("the 404 body never surfaces: a marker-bearing body stays redacted", async () => {
    fixture = startPhoenixFixture({ marketNotFound: { error: `Market 'DOGE' says ${SECRET_MARKER}` } });
    const failure = await readFailure(fixture, { market: "DOGE", owner: DEFAULT_AUTHORITY });
    expect(JSON.stringify(failure).includes(SECRET_MARKER)).toBe(false);
  });

  test("401, 429, and 5xx map to distinct provider errors without bodies", async () => {
    fixture = startPhoenixFixture({ traderStatus: 401, rawTraderBody: SECRET_MARKER });
    expect(await readFailure(fixture, REQUEST)).toMatchObject({ _tag: "PerpAuthFailed", status: 401 });
    fixture?.stop();
    fixture = startPhoenixFixture({ traderStatus: 429, rawTraderBody: SECRET_MARKER });
    expect(await readFailure(fixture, REQUEST)).toMatchObject({ _tag: "PerpRateLimited", status: 429 });
    fixture?.stop();
    fixture = startPhoenixFixture({ traderStatus: 503, rawTraderBody: SECRET_MARKER });
    const failure = await readFailure(fixture, REQUEST);
    expect(failure).toMatchObject({ _tag: "PerpHttpError", status: 503 });
    expect(JSON.stringify(failure).includes(SECRET_MARKER)).toBe(false);
  });

  test("a 200 with a body off the documented wire contract is a response failure", async () => {
    fixture = startPhoenixFixture({ rawTraderBody: "not json at all" });
    expect(await readFailure(fixture, REQUEST)).toMatchObject({ _tag: "PerpResponseInvalid", status: 200 });
  });

  test("a deadline covering the whole call fails once and is never retried", async () => {
    fixture = startPhoenixFixture({ trader: longState() }, { delayMs: 400 });
    expect(await readFailure(fixture, REQUEST, { timeoutMs: 50 })).toMatchObject({
      _tag: "PerpTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("the deadline includes response body consumption", async () => {
    fixture = startPhoenixFixture({ trader: longState() }, { bodyDelayMs: 400 });
    expect(await readFailure(fixture, REQUEST, { timeoutMs: 50 })).toMatchObject({ _tag: "PerpTimeout" });
  });

  test("a network rejection is distinct from HTTP and response failures", async () => {
    fixture = startPhoenixFixture({ trader: longState() });
    const failure = await readFailure(fixture, REQUEST, {
      fetchImpl: async () => {
        throw new TypeError("socket closed");
      },
    });
    expect(failure).toMatchObject({ _tag: "PerpNetworkError", reason: "Phoenix perps request failed" });
  });

  test("enumeration failures stay complete-or-error, never partial arrays", async () => {
    fixture = startPhoenixFixture({ markets: { error: SECRET_MARKER } });
    const failure = await listFailure(fixture, DEFAULT_AUTHORITY, { fetchImpl: async () => Response.json({ error: SECRET_MARKER }, { status: 500 }) });
    expect(failure).toMatchObject({ _tag: "PerpHttpError", status: 500 });
    expect(JSON.stringify(failure).includes(SECRET_MARKER)).toBe(false);
  });

  test("crossing the enumeration bound fails the live read instead of truncating", async () => {
    const rows = Array.from({ length: 257 }, (_, index) => positionRow(`M${index}`, "1"));
    fixture = startPhoenixFixture({
      markets: rows.map((row) => marketConfig(row.symbol, 2)),
      trader: traderState(DEFAULT_AUTHORITY, [subaccount(0, { positions: rows })]),
    });
    expect(await listFailure(fixture, DEFAULT_AUTHORITY)).toMatchObject({
      _tag: "PerpEnumerationIncomplete",
    });
  });
});
