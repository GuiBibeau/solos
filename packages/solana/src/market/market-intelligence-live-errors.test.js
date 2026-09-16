// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { askFailure, BODY_MARKER, KEY, okEnvelope, startFixture } from "./elfa-fixture.js";

describe("MarketIntelligenceLive error mapping [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("maps 401, 403, 429, and 5xx to distinct tagged errors without bodies", async () => {
    fixture = startFixture([
      { status: 401, body: { error: BODY_MARKER } },
      { status: 403, body: { error: BODY_MARKER } },
      { status: 429, body: { error: BODY_MARKER } },
      { status: 503, body: BODY_MARKER },
    ]);
    expect(await askFailure(fixture)).toMatchObject({ _tag: "IrisAuthFailed", status: 401 });
    expect(await askFailure(fixture)).toMatchObject({ _tag: "IrisAuthFailed", status: 403 });
    expect(await askFailure(fixture)).toMatchObject({ _tag: "IrisRateLimited", status: 429 });
    expect(await askFailure(fixture)).toMatchObject({ _tag: "IrisUpstreamError", status: 503 });
    expect(fixture.requests).toHaveLength(4);
  });

  test("maps non-JSON and off-envelope 200s to an upstream error", async () => {
    fixture = startFixture([
      { body: "not json at all" },
      { body: { success: false, data: {} } },
      { body: { success: true, data: { message: "", sessionId: "s", creditsConsumed: 1 } } },
      { body: { success: true, data: { message: "ok", sessionId: "s" } } },
      { body: { success: true, data: { message: "ok", sessionId: "s", creditsConsumed: -1 } } },
    ]);
    for (const reason of ["no json", "success false", "empty message", "no credits", "negative"]) {
      const failure = await askFailure(fixture);
      expect(failure?._tag, reason).toBe("IrisUpstreamError");
      expect(failure?.status, reason).toBe(200);
    }
    expect(fixture.requests).toHaveLength(5);
  });

  test("a request past its deadline fails once and is never retried", async () => {
    fixture = startFixture([{ body: okEnvelope() }], { delayMs: 400 });
    expect(await askFailure(fixture, { timeoutMs: 50 })).toMatchObject({
      _tag: "IrisTimeout",
      timeoutMs: 50,
    });
    expect(fixture.requests).toHaveLength(1);
  });

  test("error payloads never carry the api key or a raw response body", async () => {
    fixture = startFixture([{ status: 401, body: { error: BODY_MARKER } }]);
    const rendered = JSON.stringify(await askFailure(fixture));
    expect(rendered.includes(KEY)).toBe(false);
    expect(rendered.includes(BODY_MARKER)).toBe(false);
    expect(rendered.includes(fixture.url)).toBe(false);
  });
});
