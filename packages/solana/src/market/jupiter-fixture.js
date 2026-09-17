// @ts-check
import { getPrice } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { JupiterPriceLive } from "./jupiter-price-live.js";

export const KEY = "test-jupiter-key";
/** wSOL: a well-known public mint, used as the fixture subject. */
export const MINT = "So11111111111111111111111111111111111111112";
export const BAD_MINT = "not-a-mint";
/** Passes the 32–44 character base58 rule yet decodes to 33 bytes, not a Solana address. */
export const TOO_LONG_MINT = "z".repeat(44);
export const PRICE = 100.46852810203305;
export const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

/** Documented success body the fixture serves by default: one mint, `usdPrice` a JSON number. */
export const okBody = (usdPrice = PRICE) => ({
  [MINT]: { usdPrice, blockId: 4815, decimals: 9, priceChange24h: 1.5 },
});

/**
 * Offline loopback Jupiter fixture: records every request, answers by shifting the queue.
 * Never contacts the real Jupiter endpoint.
 * @param {Array<{ status?: number; body?: unknown; location?: string }>} responses
 * @param {{ delayMs?: number; bodyDelayMs?: number }} [options]
 */
export const startFixture = (responses, { delayMs = 0, bodyDelayMs = 0 } = {}) => {
  /** @type {Array<{ url: string; method: string; key: string | undefined; ids: string | undefined }>} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        ids: new URL(request.url).searchParams.get("ids") ?? undefined,
      });
      const next = responses.shift() ?? { status: 500, body: BODY_MARKER };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const payload = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
      const headers = /** @type {Record<string, string>} */ ({
        "content-type": "application/json",
      });
      if (next.location) headers.location = next.location;
      return new Response(delayedBody(payload, bodyDelayMs), {
        status: next.status ?? 200,
        headers,
      });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
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
 * Run the real use case against the fixture-backed live adapter and await the price.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {string} mint
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-api.js").Fetch }>} [overrides]
 */
export const priceThrough = (fixture, mint, overrides = {}) =>
  Effect.runPromise(
    getPrice({ mint }).pipe(Effect.provide(JupiterPriceLive(toConfig(fixture, overrides)))),
  );

/**
 * Run a price read and hand back the tagged failure, or undefined when it unexpectedly succeeded.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-api.js").Fetch }>} [overrides]
 * @param {string} [mint]
 */
export const priceFailure = async (fixture, overrides = {}, mint = MINT) => {
  const exit = await Effect.runPromiseExit(
    getPrice({ mint }).pipe(Effect.provide(JupiterPriceLive(toConfig(fixture, overrides)))),
  );
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/** @param {ReturnType<typeof startFixture>} fixture @param {Partial<{ apiKey: string; timeoutMs: number; fetchImpl: import("./jupiter-api.js").Fetch }>} overrides */
const toConfig = (fixture, overrides) => ({
  baseUrl: fixture.url,
  apiKey: "apiKey" in overrides ? overrides.apiKey : KEY,
  timeoutMs: overrides.timeoutMs,
  fetchImpl: overrides.fetchImpl,
});
