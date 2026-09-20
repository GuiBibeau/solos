// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { KEY, okBody } from "./jupiter-swap-bodies.js";
import { MAX_SWAP_RESPONSE_BYTES } from "./jupiter-swap-body.js";
import { BODY_MARKER, quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

const oversizedStream = (contentLength) => {
  let isFirst = true;
  let isCancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(
        isFirst ? new Uint8Array(MAX_SWAP_RESPONSE_BYTES) : new TextEncoder().encode(BODY_MARKER),
      );
      isFirst = false;
    },
    cancel() {
      isCancelled = true;
    },
  });
  const headers = contentLength ? { "content-length": contentLength } : undefined;
  return { response: new Response(body, { headers }), wasCancelled: () => isCancelled };
};

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

  test("rejects a declared oversized body without exposing its contents", async () => {
    fixture = startFixture([]);
    const response = new Response(BODY_MARKER, {
      headers: { "content-length": String(MAX_SWAP_RESPONSE_BYTES + 1) },
    });
    const failure = await quoteFailure(fixture, { fetchImpl: async () => response });
    expect(failure).toMatchObject({
      _tag: "QuoteNetworkError",
      reason: "Jupiter swap quote request failed",
    });
    const rendered = JSON.stringify(failure);
    expect(rendered).not.toContain(BODY_MARKER);
    expect(rendered).not.toContain(KEY);
  });

  test("caps streamed bodies when Content-Length is missing or dishonest", async () => {
    fixture = startFixture([]);
    for (const contentLength of [undefined, "1"]) {
      const oversized = oversizedStream(contentLength);
      const failure = await quoteFailure(fixture, {
        fetchImpl: async () => oversized.response,
      });
      expect(failure).toMatchObject({
        _tag: "QuoteNetworkError",
        reason: "Jupiter swap quote request failed",
      });
      expect(JSON.stringify(failure)).not.toContain(BODY_MARKER);
      expect(oversized.wasCancelled()).toBe(true);
    }
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
});
