// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  ANSWER,
  askFailure,
  askThrough,
  KEY,
  okEnvelope,
  QUESTION,
  startFixture,
} from "./elfa-fixture.js";

describe("MarketIntelligenceLive success and validation [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("sends one documented chat request and returns the answer with credit usage", async () => {
    fixture = startFixture([{ body: okEnvelope() }]);
    const before = Date.now();
    const answer = await askThrough(fixture, QUESTION);
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
    fixture = startFixture([{ body: okEnvelope() }]);
    expect((await askFailure(fixture, {}, ""))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure(fixture, {}, " ".repeat(3)))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure(fixture, {}, "x".repeat(4001)))._tag).toBe("IrisQuestionInvalid");
    expect((await askFailure(fixture, { apiKey: "" }))._tag).toBe("IrisConfigMissing");
    expect(fixture.requests).toHaveLength(0);
  });
});
