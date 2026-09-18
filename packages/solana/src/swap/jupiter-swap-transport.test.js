// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { KEY, okBody } from "./jupiter-swap-bodies.js";
import { quoteFailure, startFixture } from "./jupiter-swap-fixture.js";

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
