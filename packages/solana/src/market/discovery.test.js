// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { getEventSummary, getTokenNews, getTrendingTokens } from "@solos/core";
import { Cause, Effect, Exit, Option } from "effect";
import { startFixture } from "./elfa-fixture.js";
import { MarketIntelligenceLive } from "./market-intelligence-live.js";

let fixture;
afterEach(() => fixture?.stop());

const run = (effect, overrides = {}) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(
        MarketIntelligenceLive({ baseUrl: fixture.url, apiKey: "test-key", ...overrides }),
      ),
    ),
  );
const failure = (exit) =>
  Exit.isFailure(exit) ? Option.getOrUndefined(Cause.failureOption(exit.cause)) : undefined;

describe("Elfa discovery input, deadlines, and empty windows [integration]", () => {
  test("invalid input and missing keys fail before any HTTP request", async () => {
    fixture = startFixture([]);
    for (const effect of [
      getTrendingTokens({ pageSize: 100 }),
      getTrendingTokens({ timeWindow: "bad" }),
      getTokenNews({ coinIds: [] }),
      getTokenNews({ coinIds: [" "] }),
      getEventSummary({ keywords: ["SOL,ETH"] }),
      getEventSummary({ keywords: ["SOL"], searchType: "bad" }),
    ]) {
      expect(failure(await run(effect))._tag).toBe("IrisInputInvalid");
    }
    expect(failure(await run(getTrendingTokens({}), { apiKey: undefined }))._tag).toBe(
      "IrisConfigMissing",
    );
    expect(fixture.requests).toHaveLength(0);
  });

  test("empty data is valid and never fabricated into an answer", async () => {
    fixture = startFixture([
      { body: { success: true, data: { page: 1, pageSize: 10, total: 0, data: [] } } },
      { body: { success: true, data: [], metadata: { page: 1, pageSize: 10, total: 0 } } },
      { body: { success: true, data: [] } },
    ]);
    expect((await run(getTrendingTokens({}))).value.tokens).toEqual([]);
    expect((await run(getTokenNews({ coinIds: ["solana"] }))).value.mentions).toEqual([]);
    expect((await run(getEventSummary({ keywords: ["no events"] }))).value.summaries).toEqual([]);
    expect(fixture.requests).toHaveLength(3);
  });

  test("deadline includes the GET response body and no retry occurs", async () => {
    fixture = startFixture([{ body: { success: true, data: [] } }], { bodyDelayMs: 300 });
    expect(failure(await run(getEventSummary({ keywords: ["SOL"] }), { timeoutMs: 30 }))._tag).toBe(
      "IrisTimeout",
    );
    expect(fixture.requests).toHaveLength(1);
  });
});
