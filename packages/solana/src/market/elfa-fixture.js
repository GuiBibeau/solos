// @ts-check
import { askIris } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { MarketIntelligenceLive } from "./market-intelligence-live.js";

export const KEY = "test-elfa-key";
export const QUESTION = "What changed for SOL in the last 24 hours? Include source links.";
export const ANSWER =
  "SOL rose 3% after the upgrade announcement https://example.com/sol-upgrade; the ETF rumor " +
  "remains speculation per https://example.com/rumor.";
export const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

/** Documented success envelope the fixture serves by default. */
export const okEnvelope = () => ({
  success: true,
  data: { message: ANSWER, sessionId: "s-1", creditsConsumed: 7 },
});

/**
 * Offline loopback Elfa fixture: records every request, answers by shifting the queue.
 * Never contacts the real Elfa endpoint.
 * @param {Array<{ status?: number; body?: unknown }>} responses
 * @param {{ delayMs?: number }} [options]
 */
export const startFixture = (responses, { delayMs = 0 } = {}) => {
  /** @type {Array<{ url: string; method: string; key: string | undefined; body: string }>} */
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = await request.text();
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-elfa-api-key") ?? undefined,
        body,
      });
      const next = responses.shift() ?? { status: 500, body: BODY_MARKER };
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const payload = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
      return new Response(payload, {
        status: next.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/**
 * Run the real use case against the fixture-backed live adapter and await the answer.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {string} question
 * @param {Partial<{ apiKey: string; timeoutMs: number }>} [overrides]
 */
export const askThrough = (fixture, question, overrides = {}) =>
  Effect.runPromise(
    askIris({ question }).pipe(
      Effect.provide(MarketIntelligenceLive(toConfig(fixture, overrides))),
    ),
  );

/**
 * Run an ask and hand back the tagged failure, or undefined when it unexpectedly succeeded.
 * @param {ReturnType<typeof startFixture>} fixture
 * @param {Partial<{ apiKey: string; timeoutMs: number }>} [overrides]
 * @param {string} [question]
 */
export const askFailure = async (fixture, overrides = {}, question = QUESTION) => {
  const exit = await Effect.runPromiseExit(
    askIris({ question }).pipe(
      Effect.provide(MarketIntelligenceLive(toConfig(fixture, overrides))),
    ),
  );
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/** @param {ReturnType<typeof startFixture>} fixture @param {Partial<{ apiKey: string; timeoutMs: number }>} overrides */
const toConfig = (fixture, overrides) => ({
  baseUrl: fixture.url,
  apiKey: "apiKey" in overrides ? overrides.apiKey : KEY,
  timeoutMs: overrides.timeoutMs,
});
