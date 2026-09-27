// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { KEY, okBody } from "./jupiter-swap-bodies.js";
import { MAX_SWAP_RESPONSE_BYTES } from "./jupiter-swap-body.js";
import { BODY_MARKER, quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Transport failures: a cross-origin redirect is rejected before the destination is contacted,
 * the deadline covers headers and body alike, and a network rejection maps separately from
 * HTTP and response failures. Nothing is retried.
 */

describe("JupiterSwapLive transport failures [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("a redirect to another origin is rejected before that destination is contacted", async () => {
    const other = startFixture([]);
    fixture = startFixture([{ status: 302, location: `${other.url}/swap/v2/order` }]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({ _tag: "QuoteNetworkError" });
    expect(fixture.requests).toHaveLength(1);
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
      reason: "Jupiter did not answer within 50ms",
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("the request deadline includes response body consumption", async () => {
    fixture = startFixture([{ body: okBody() }], { bodyDelayMs: 400 });
    expect(await quoteFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "QuoteTimeout",
      timeoutMs: 50,
      reason: "Jupiter did not answer within 50ms",
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("rejects a declared oversized body without exposing its contents", async () => {
    fixture = startFixture([{ body: `${"x".repeat(MAX_SWAP_RESPONSE_BYTES)}${BODY_MARKER}` }]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "QuoteNetworkError",
      reason: "Jupiter swap quote request failed",
    });
    const rendered = JSON.stringify(failure);
    expect(rendered).not.toContain(BODY_MARKER);
    expect(rendered).not.toContain(KEY);
  });

  test("caps a streamed body when Content-Length is missing", async () => {
    fixture = startFixture([
      { body: `${"x".repeat(MAX_SWAP_RESPONSE_BYTES)}${BODY_MARKER}`, stream: true },
    ]);
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "QuoteNetworkError",
      reason: "Jupiter swap quote request failed",
    });
    expect(JSON.stringify(failure)).not.toContain(BODY_MARKER);
    expect(fixture.requests).toHaveLength(1);
  });

  test("maps a network rejection separately from HTTP and response failures", async () => {
    fixture = startFixture([]);
    fixture.stop();
    const failure = await quoteFailure(fixture);
    expect(failure).toMatchObject({
      _tag: "QuoteNetworkError",
      reason: "Jupiter swap quote request failed",
    });
    expect(fixture.requests).toHaveLength(0);
  });
});
