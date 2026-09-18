// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { SwapProvider } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import {
  BODY_MARKER,
  KEY,
  INPUT_MINT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
  quoteFailure,
  startFixture,
} from "./jupiter-swap-fixture.js";
import { JupiterSwapLive } from "./jupiter-swap-live.js";

describe("JupiterSwapLive error mapping [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("maps 401, 403, 429, 400, and 5xx to distinct tagged errors without bodies, one request each", async () => {
    fixture = startFixture([
      { status: 401, body: { error: BODY_MARKER } },
      { status: 403, body: { message: BODY_MARKER } },
      { status: 429, body: { code: 429, message: BODY_MARKER } },
      { status: 400, body: { error: "Invalid outputMint" } },
      { status: 500, body: BODY_MARKER },
      { status: 503, body: BODY_MARKER },
    ]);
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteAuthFailed", status: 401 });
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteAuthFailed", status: 403 });
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteRateLimited", status: 429 });
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteHttpError", status: 400 });
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteHttpError", status: 500 });
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteHttpError", status: 503 });
    expect(fixture.requests).toHaveLength(6);
  });

  test("maps the documented no-route 400 body to NoRouteFound", async () => {
    fixture = startFixture([
      { status: 400, body: { requestId: "01a0b360-0000", error: "Failed to get quotes" } },
    ]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "NoRouteFound",
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      provider: "jupiter",
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("treats a 400 whose error is an object, not the message string, as an HTTP failure", async () => {
    fixture = startFixture([
      {
        status: 400,
        body: {
          success: false,
          error: { issues: [{ code: "invalid_type", path: ["amount"], message: "Required" }] },
        },
      },
    ]);
    expect(await quoteFailure(fixture)).toMatchObject({ _tag: "QuoteHttpError", status: 400 });
  });

  test("maps a 200 with an empty route plan to NoRouteFound", async () => {
    fixture = startFixture([{ body: okBody({ routePlan: [] }) }]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "NoRouteFound",
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      provider: "jupiter",
    });
  });

  test("rejects unsupported router, non-ExactIn mode, and executable transaction payloads", async () => {
    fixture = startFixture([
      { body: okBody({ router: "jupiterz" }) },
      { body: okBody({ swapMode: "ExactOut" }) },
      { body: okBody({ transaction: "AmVhc29uYmFzZTY0dHJhbnNhY3Rpb24=" }) },
    ]);
    for (const expected of [
      "router outside the Metis-only restriction",
      "not an ExactIn quote",
      "non-null transaction",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects mint and amount echo mismatches against the exact request", async () => {
    fixture = startFixture([
      { body: okBody({ inputMint: OUTPUT_MINT }) },
      { body: okBody({ outputMint: INPUT_MINT }) },
      { body: okBody({ inAmount: "999" }) },
    ]);
    for (const expected of [
      "mints did not match",
      "mints did not match",
      "inAmount did not match",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(3);
  });

  test("rejects a missing minimum output or price impact instead of fabricating values", async () => {
    const withoutThreshold = okBody();
    delete withoutThreshold.otherAmountThreshold;
    const withoutImpact = okBody();
    delete withoutImpact.priceImpact;
    fixture = startFixture([{ body: withoutThreshold }, { body: withoutImpact }]);
    const thresholdFailure = await quoteFailure(fixture);
    expect(thresholdFailure?._tag).toBe("QuoteResponseInvalid");
    expect(/** @type {{reason: string}} */ (thresholdFailure).reason).toContain(
      "otherAmountThreshold",
    );
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect(fixture.requests).toHaveLength(2);
  });

  test("maps malformed envelopes to QuoteResponseInvalid, one request each", async () => {
    fixture = startFixture([{ body: "not json at all" }, { body: [] }]);
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect((await quoteFailure(fixture))?._tag).toBe("QuoteResponseInvalid");
    expect(fixture.requests).toHaveLength(2);
  });

  test("rejects malformed and inverted output amounts instead of trusting strings", async () => {
    const inverted = (BigInt(OUT_AMOUNT) + 1n).toString();
    fixture = startFixture([
      { body: okBody({ outAmount: "12.5" }) },
      { body: okBody({ otherAmountThreshold: "1.5" }) },
      { body: okBody({ otherAmountThreshold: "-5" }) },
      { body: okBody({ otherAmountThreshold: inverted }) },
    ]);
    for (const expected of [
      "outAmount was not",
      "otherAmountThreshold was not",
      "otherAmountThreshold was not",
      "exceeded the quoted output",
    ]) {
      const failure = await quoteFailure(fixture);
      expect(failure?._tag, expected).toBe("QuoteResponseInvalid");
      expect(/** @type {{reason: string}} */ (failure).reason, expected).toContain(expected);
    }
    expect(fixture.requests).toHaveLength(4);
  });

  test("a redirect to another origin is rejected before that destination is contacted", async () => {
    const other = startFixture([]);
    fixture = startFixture([{ status: 302, location: `${other.url}/swap/v2/order` }]);
    const attempted = [];
    const failure = await quoteFailure(fixture, {
      fetchImpl: async (input, init) => {
        attempted.push(String(input));
        return fetch(input, init);
      },
    });
    expect(failure).toMatchObject({ _tag: "QuoteNetworkError" });
    expect(attempted).toHaveLength(1);
    expect(attempted[0].startsWith(fixture.url)).toBe(true);
    expect(other.requests).toHaveLength(0);
    const rendered = JSON.stringify(failure);
    expect(rendered.includes(KEY)).toBe(false);
    expect(rendered.includes(other.url)).toBe(false);
    other.stop();
  });

  test("a request past its deadline fails once and is never retried", async () => {
    fixture = startFixture([{ body: okBody() }], { delayMs: 400 });
    expect(await quoteFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "QuoteTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("the request deadline includes response body consumption", async () => {
    fixture = startFixture([{ body: okBody() }], { bodyDelayMs: 400 });
    expect(await quoteFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "QuoteTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("maps a network rejection separately from HTTP and response failures", async () => {
    fixture = startFixture([]);
    const failure = await quoteFailure(fixture, {
      fetchImpl: async () => {
        throw new TypeError("socket closed");
      },
    });
    expect(failure).toMatchObject({
      _tag: "QuoteNetworkError",
      reason: "Jupiter swap quote request failed",
    });
    expect(fixture.requests).toHaveLength(0);
  });

  test("error payloads never carry the api key or a raw response body", async () => {
    fixture = startFixture([{ status: 401, body: { error: BODY_MARKER } }]);
    const rendered = JSON.stringify(await quoteFailure(fixture));
    expect(rendered.includes(KEY)).toBe(false);
    expect(rendered.includes(BODY_MARKER)).toBe(false);
    expect(rendered.includes(fixture.url)).toBe(false);
  });

  test("the port-required execute fails fast with SwapFailed and performs no I/O", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(SwapProvider, (provider) =>
        provider.execute(/** @type {any} */ ({}), { skipSimulation: false }),
      ).pipe(Effect.provide(JupiterSwapLive({ baseUrl: fixture.url, apiKey: KEY }))),
    );
    expect(Exit.isSuccess(exit)).toBe(false);
    const failure = Cause.failureOption(exit.cause);
    const swapFailed = Option.isSome(failure) ? failure.value : undefined;
    expect(swapFailed).toMatchObject({ _tag: "SwapFailed", signature: null });
    expect(/** @type {{reason: string}} */ (swapFailed).reason).toContain("#18");
    expect(fixture.requests).toHaveLength(0);
  });
});
