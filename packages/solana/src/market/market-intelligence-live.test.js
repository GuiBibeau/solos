// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { askIris } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { MarketIntelligenceLive } from "./market-intelligence-live.js";

const KEY = "test-elfa-key";
const QUESTION = "What changed for SOL in the last 24 hours? Include source links.";
const ANSWER =
  "SOL rose 3% after the upgrade announcement https://example.com/sol-upgrade; the ETF rumor " +
  "remains speculation per https://example.com/rumor.";
const BODY_MARKER = "SECRET-UPSTREAM-BODY-MARKER";

const okEnvelope = () => ({
  success: true,
  data: { message: ANSWER, sessionId: "s-1", creditsConsumed: 7 },
});

describe("MarketIntelligenceLive over the real HTTP adapter [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;
  let delayMs = 0;

  /**
   * Loopback Elfa fixture: records every request, answers by shifting the queue.
   * @param {Array<{ status?: number; body?: unknown }>} responses
   */
  const startFixture = (responses) => {
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

  /** @param {Array<{ status?: number; body?: unknown }>} responses @param {number} [delay] */
  const start = (responses, delay = 0) => {
    delayMs = delay;
    fixture = startFixture(responses);
  };

  /** @param {Partial<{ apiKey: string; timeoutMs: number }>} overrides */
  const config = (overrides = {}) => ({
    baseUrl: fixture.url,
    apiKey: "apiKey" in overrides ? overrides.apiKey : KEY,
    timeoutMs: overrides.timeoutMs,
  });

  /** @param {string} question @param {Partial<{ apiKey: string; timeoutMs: number }>} overrides */
  const ask = (question, overrides = {}) =>
    Effect.runPromise(
      askIris({ question }).pipe(Effect.provide(MarketIntelligenceLive(config(overrides)))),
    );

  /**
   * Run an ask and hand back the tagged failure, or undefined when it unexpectedly succeeded.
   * @param {Partial<{ apiKey: string; timeoutMs: number }>} [overrides]
   * @param {string} [question]
   */
  const askFailure = async (overrides = {}, question = QUESTION) => {
    const exit = await Effect.runPromiseExit(
      askIris({ question }).pipe(Effect.provide(MarketIntelligenceLive(config(overrides)))),
    );
    if (Exit.isSuccess(exit)) return undefined;
    const failure = Cause.failureOption(exit.cause);
    return Option.isSome(failure) ? failure.value : undefined;
  };

  afterEach(() => {
    fixture?.stop();
    delayMs = 0;
  });

  test("sends one documented chat request and returns the answer with credit usage", async () => {
    start([{ body: okEnvelope() }]);
    const before = Date.now();
    const answer = await ask(QUESTION);
    expect(fixture.requests).toHaveLength(1);
    const [request] = fixture.requests;
    expect(request.method).toBe("POST");
    expect(request.url).toBe(`${fixture.url}/v2/chat`);
    expect(request.key).toBe(KEY);
    expect(request.url.includes(KEY)).toBe(false);
    const sent = JSON.parse(request.body);
    expect(sent).toEqual({ analysisType: "chat", message: QUESTION, speed: "fast" });
    expect(Object.hasOwn(sent, "sessionId")).toBe(false);
    expect(answer.provider).toBe("elfa");
    expect(answer.answer).toBe(ANSWER);
    expect(answer.answer).toContain("https://example.com/sol-upgrade");
    expect(answer.creditsConsumed).toBe(7);
    expect(answer.receivedAt).toBeGreaterThanOrEqual(before);
    expect(JSON.stringify(answer).includes("sessionId")).toBe(false);
  });

  test("rejects invalid input and missing key before any HTTP", async () => {
    start([{ body: okEnvelope() }]);
    expect((await askFailure({}, ""))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure({}, " ".repeat(3)))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure({}, "x".repeat(4001)))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure({ apiKey: "" }))._tag).toBe("IrisConfigMissing");
    expect(fixture.requests).toHaveLength(0);
  });

  test("maps 401, 403, 429, and 5xx to distinct tagged errors without bodies", async () => {
    start([
      { status: 401, body: { error: BODY_MARKER } },
      { status: 403, body: { error: BODY_MARKER } },
      { status: 429, body: { error: BODY_MARKER } },
      { status: 503, body: BODY_MARKER },
    ]);
    expect(await askFailure({})).toMatchObject({ _tag: "IrisAuthFailed", status: 401 });
    expect(await askFailure({})).toMatchObject({ _tag: "IrisAuthFailed", status: 403 });
    expect(await askFailure({})).toMatchObject({ _tag: "IrisRateLimited", status: 429 });
    expect(await askFailure({})).toMatchObject({ _tag: "IrisUpstreamError", status: 503 });
    expect(fixture.requests).toHaveLength(4);
  });

  test("maps non-JSON and off-envelope 200s to an upstream error", async () => {
    start([
      { body: "not json at all" },
      { body: { success: false, data: {} } },
      { body: { success: true, data: { message: "", sessionId: "s", creditsConsumed: 1 } } },
      { body: { success: true, data: { message: "ok", sessionId: "s" } } },
      { body: { success: true, data: { message: "ok", sessionId: "s", creditsConsumed: -1 } } },
    ]);
    for (const reason of ["no json", "success false", "empty message", "no credits", "negative"]) {
      const failure = await askFailure({});
      expect(failure?._tag, reason).toBe("IrisUpstreamError");
      expect(failure?.status, reason).toBe(200);
    }
    expect(fixture.requests).toHaveLength(5);
  });

  test("a request past its deadline fails once and is never retried", async () => {
    start([{ body: okEnvelope() }], 400);
    expect(await askFailure({ timeoutMs: 50 })).toMatchObject({
      _tag: "IrisTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("error payloads never carry the api key or a raw response body", async () => {
    start([{ status: 401, body: { error: BODY_MARKER } }]);
    const rendered = JSON.stringify(await askFailure({}));
    expect(rendered.includes(KEY)).toBe(false);
    expect(rendered.includes(BODY_MARKER)).toBe(false);
    expect(rendered.includes(fixture.url)).toBe(false);
  });
});
