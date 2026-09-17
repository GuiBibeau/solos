// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { BODY_MARKER, KEY, MINT, okBody, priceFailure, startFixture } from "./jupiter-fixture.js";

describe("JupiterPriceLive error mapping [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("maps 401, 403, 429, and 5xx to distinct tagged errors without bodies, one request each", async () => {
    fixture = startFixture([
      { status: 401, body: { error: BODY_MARKER } },
      { status: 403, body: { code: 403, message: BODY_MARKER } },
      { status: 429, body: { code: 429, message: BODY_MARKER } },
      { status: 500, body: BODY_MARKER },
      { status: 503, body: BODY_MARKER },
    ]);
    expect(await priceFailure(fixture)).toMatchObject({ _tag: "PriceAuthFailed", status: 401 });
    expect(await priceFailure(fixture)).toMatchObject({ _tag: "PriceAuthFailed", status: 403 });
    expect(await priceFailure(fixture)).toMatchObject({ _tag: "PriceRateLimited", status: 429 });
    expect(await priceFailure(fixture)).toMatchObject({ _tag: "PriceHttpError", status: 500 });
    expect(await priceFailure(fixture)).toMatchObject({ _tag: "PriceHttpError", status: 503 });
    expect(fixture.requests).toHaveLength(5);
  });

  test("maps non-JSON bodies and bad usdPrice values to an upstream error, one request each", async () => {
    fixture = startFixture([
      { body: "not json at all" },
      { body: [] },
      { body: { [MINT]: { usdPrice: null } } },
      { body: { [MINT]: { usdPrice: "12.5" } } },
      { body: { [MINT]: { usdPrice: -0.01 } } },
      { body: `{"${MINT}":{"usdPrice":1e999}}` },
    ]);
    const reasons = ["text", "array", "null", "string", "negative", "infinite"];
    for (const [index, reason] of reasons.entries()) {
      const failure = await priceFailure(fixture);
      expect(failure?._tag, reason).toBe("PriceResponseInvalid");
      expect(fixture.requests, reason).toHaveLength(index + 1);
    }
  });

  test("a request past its deadline fails once and is never retried", async () => {
    fixture = startFixture([{ body: okBody() }], { delayMs: 400 });
    expect(await priceFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "PriceTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("the request deadline includes response body consumption", async () => {
    fixture = startFixture([{ body: okBody() }], { bodyDelayMs: 400 });
    expect(await priceFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "PriceTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("maps a network rejection separately from HTTP and response failures", async () => {
    fixture = startFixture([]);
    const failure = await priceFailure(fixture, {
      fetchImpl: async () => {
        throw new TypeError("socket closed");
      },
    });
    expect(failure).toMatchObject({
      _tag: "PriceNetworkError",
      reason: "Jupiter price request failed",
    });
    expect(fixture.requests).toHaveLength(0);
  });

  test("error payloads never carry the api key or a raw response body", async () => {
    fixture = startFixture([{ status: 401, body: { error: BODY_MARKER } }]);
    const rendered = JSON.stringify(await priceFailure(fixture));
    expect(rendered.includes(KEY)).toBe(false);
    expect(rendered.includes(BODY_MARKER)).toBe(false);
    expect(rendered.includes(fixture.url)).toBe(false);
  });
});
