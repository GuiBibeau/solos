// @ts-check
import { getQuote } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { KEY, quoteRequest } from "./jupiter-swap-bodies.js";
import { JupiterSwapLive } from "./jupiter-swap-live.js";

/**
 * Recording loopback fixture for the Jupiter Swap V2 quote-only endpoint: it records every
 * request and answers by shifting the response queue, never contacting the real Jupiter
 * endpoint. The drivers run the real use case against the fixture-backed live adapter; canned
 * bodies live in jupiter-swap-bodies.js.
 */

/**
 * @typedef {Array<{ status?: number; body?: unknown; location?: string; stream?: boolean }>} FixtureResponses
 * @typedef {{ url: string; method: string; key: string | undefined; inputMint: string | null; outputMint: string | null; amount: string | null; slippageBps: string | null; swapMode: string | null; excludeRouters: string | null; taker: string | null }} RecordedRequest
 */

export const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

/**
 * Recording loopback fixture: records every request, answers by shifting the response queue.
 * @param {FixtureResponses} responses
 * @param {{ delayMs?: number; bodyDelayMs?: number }} [options]
 */
export const startFixture = (responses, { delayMs = 0, bodyDelayMs = 0 } = {}) => {
  /** @type {RecordedRequest[]} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const params = new URL(request.url).searchParams;
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        inputMint: params.get("inputMint"),
        outputMint: params.get("outputMint"),
        amount: params.get("amount"),
        slippageBps: params.get("slippageBps"),
        swapMode: params.get("swapMode"),
        excludeRouters: params.get("excludeRouters"),
        taker: params.get("taker"),
      });
      const next = responses.shift() ?? { status: 500, body: BODY_MARKER };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const payload = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
      const headers = /** @type {Record<string, string>} */ ({
        "content-type": "application/json",
      });
      if (next.location) headers.location = next.location;
      const body = next.stream ? streamedBody(payload) : delayedBody(payload, bodyDelayMs);
      return new Response(body, {
        status: next.status ?? 200,
        headers,
      });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @param {string} payload */
const streamedBody = (payload) => {
  let isSent = false;
  return new ReadableStream({
    pull(controller) {
      if (isSent) return controller.close();
      controller.enqueue(new TextEncoder().encode(payload));
      isSent = true;
    },
  });
};

/** @param {string} payload @param {number} delayMs */
const delayedBody = (payload, delayMs) => {
  if (delayMs === 0) return payload;
  return new ReadableStream({
    async start(controller) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      } catch {
        // The client deadline can cancel the stream before the fixture writes its body.
      }
    },
  });
};

/**
 * Run the real use case against the fixture-backed live adapter and await the quote.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} [overrides]
 * @param {import("@solos/core").SwapQuoteRequest} [request]
 */
export const quoteThrough = (fixture, overrides = {}, request = quoteRequest()) =>
  Effect.runPromise(
    getQuote(request).pipe(Effect.provide(JupiterSwapLive(toConfig(fixture, overrides)))),
  );

/**
 * Run a quote read and hand back the tagged failure, or undefined when it unexpectedly succeeded.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} [overrides]
 * @param {import("@solos/core").SwapQuoteRequest} [request]
 */
export const quoteFailure = async (fixture, overrides = {}, request = quoteRequest()) => {
  const exit = await Effect.runPromiseExit(
    getQuote(request).pipe(Effect.provide(JupiterSwapLive(toConfig(fixture, overrides)))),
  );
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/** @param {ReturnType<typeof startFixture>} fixture @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-swap-api.js").Fetch }>} overrides */
const toConfig = (fixture, overrides) => ({
  baseUrl: fixture.url,
  apiKey: "apiKey" in overrides ? overrides.apiKey : KEY,
  timeoutMs: overrides.timeoutMs,
  fetchImpl: overrides.fetchImpl,
});
