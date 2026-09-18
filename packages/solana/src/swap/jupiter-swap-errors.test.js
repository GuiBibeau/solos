// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { SwapProvider } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { INPUT_MINT, KEY, OUTPUT_MINT, okBody } from "./jupiter-swap-bodies.js";
import { BODY_MARKER, quoteFailure, startFixture } from "./jupiter-swap-fixture.js";
import { JupiterSwapLive } from "./jupiter-swap-live.js";

/**
 * Error mapping at the HTTP boundary: documented statuses to distinct tagged errors, the
 * documented no-route 400 body to NoRouteFound, redaction of bodies and keys, and the
 * port-required execute failing fast without I/O.
 */

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
