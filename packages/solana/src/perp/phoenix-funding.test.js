// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { SECRET_MARKER, startPhoenixFixture } from "./phoenix-fixture.js";
import { fundingMarket } from "./phoenix-scenarios.js";
import { fundingFailure, fundingThrough } from "./phoenix-through.js";

const HOUR = 3600;
const second = Math.floor(Date.now() / 1000);
const iso = (/** @type {number} */ sec) => new Date(sec * 1000).toISOString();
const REQUEST = { market: "SOL", lookbackHours: 24 };
const solMarket = { SOL: fundingMarket("SOL", second) };

/** @param {unknown} failure */
const hidesMarker = (failure) =>
  expect(JSON.stringify(failure).includes(SECRET_MARKER)).toBe(false);

describe("PerpVenueLive funding reads through the loopback Phoenix fixture [integration]", () => {
  /** @type {ReturnType<typeof startPhoenixFixture>} */
  let fixture;

  afterEach(() => fixture?.stop());

  test("a market with history returns the hourly rate, APR, next funding, and ordered history", async () => {
    fixture = startPhoenixFixture({
      market: solMarket,
      funding: {
        SOL: {
          rates: [
            { timestamp: second - 25 * HOUR, fundingRatePercentage: "9" },
            { timestamp: second - 2 * HOUR, fundingRatePercentage: "0.001" },
            { timestamp: second - HOUR, fundingRatePercentage: "0.002" },
            { timestamp: second, fundingRatePercentage: "0.003" },
          ],
        },
      },
    });
    const result = await fundingThrough(fixture, REQUEST);
    expect(result).toMatchObject({
      market: "SOL-PERP",
      at: iso(second),
      rateHourlyPct: "0.003",
      aprPct: "26.28",
      nextFundingAt: iso(second + HOUR),
    });
    expect(result.history).toEqual([
      { at: iso(second - 2 * HOUR), rateHourlyPct: "0.001" },
      { at: iso(second - HOUR), rateHourlyPct: "0.002" },
      { at: iso(second), rateHourlyPct: "0.003" },
    ]);
  });

  test("empty rates with a current print return history: []", async () => {
    fixture = startPhoenixFixture({
      market: { ETH: fundingMarket("ETH", second) },
      funding: { ETH: { rates: [], fundingRatePercentage: "-0.004", timestamp: second } },
    });
    const result = await fundingThrough(fixture, { market: "ETH", lookbackHours: 24 });
    expect(result).toMatchObject({
      market: "ETH-PERP",
      at: iso(second),
      rateHourlyPct: "-0.004",
      aprPct: "-35.04",
    });
    expect(result.history).toEqual([]);
  });

  test("an unknown market is PerpMarketUnknown before the rates route", async () => {
    fixture = startPhoenixFixture({ market: solMarket });
    const failure = await fundingFailure(fixture, { market: "DOGE", lookbackHours: 24 });
    expect(failure).toMatchObject({ _tag: "PerpMarketUnknown", market: "DOGE" });
    expect(fixture.requests.map((entry) => entry.path)).toEqual(["/v1/view/exchange/market/DOGE"]);
  });

  test("HTTP, network, timeout, and invalid wire stay typed and redact the upstream body", async () => {
    fixture = startPhoenixFixture({
      market: solMarket,
      fundingStatus: 503,
      rawFundingBody: SECRET_MARKER,
    });
    const http = await fundingFailure(fixture, REQUEST);
    expect(http).toMatchObject({ _tag: "PerpHttpError", status: 503 });
    hidesMarker(http);
    fixture.stop();

    fixture = startPhoenixFixture({ market: solMarket });
    const network = await fundingFailure(fixture, REQUEST, {
      fetchImpl: async () => {
        throw new TypeError(SECRET_MARKER);
      },
    });
    expect(network).toMatchObject({
      _tag: "PerpNetworkError",
      reason: "Phoenix perps request failed",
    });
    hidesMarker(network);
    fixture.stop();

    fixture = startPhoenixFixture(
      { market: solMarket, rawFundingBody: SECRET_MARKER },
      { delayMs: 400 },
    );
    const timeout = await fundingFailure(fixture, REQUEST, { timeoutMs: 50 });
    expect(timeout).toMatchObject({ _tag: "PerpTimeout", timeoutMs: 50 });
    hidesMarker(timeout);
    expect(fixture.requests).toHaveLength(1);
    fixture.stop();

    fixture = startPhoenixFixture({
      market: solMarket,
      rawFundingBody: `not-json ${SECRET_MARKER}`,
    });
    const invalid = await fundingFailure(fixture, REQUEST);
    expect(invalid).toMatchObject({ _tag: "PerpResponseInvalid", status: 200 });
    hidesMarker(invalid);
  });
});
