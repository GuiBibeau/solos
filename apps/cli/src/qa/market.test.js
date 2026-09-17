// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { runIrisQa } from "./iris.js";
import { IrisQaSchema } from "./schema.js";

const KEY = "offline-market-key";
const LINK = "https://x.com/example/status/123";
const page = { page: 1, pageSize: 5, total: 1 };
const payloads = {
  "/v2/aggregations/trending-tokens": {
    success: true,
    data: {
      ...page,
      data: [{ token: "SOL", current_count: 20, previous_count: 10, change_percent: 100 }],
    },
  },
  "/v2/data/token-news": {
    success: true,
    metadata: page,
    data: [
      {
        tweetId: "123",
        link: LINK,
        mentionedAt: "2026-09-17T00:00:00Z",
        type: "post",
        likeCount: 3,
        repostCount: 2,
        viewCount: null,
        quoteCount: 0,
        replyCount: 0,
        bookmarkCount: null,
        repostBreakdown: { ct: 1, smart: 1 },
        privateProviderField: KEY,
      },
    ],
  },
  "/v2/data/event-summary": {
    success: true,
    data: [
      {
        summary: "Solana upgrade announced.",
        sourceLinks: [LINK],
        tweetIds: ["123"],
      },
    ],
  },
};
let server;
afterEach(() => server?.stop(true));

const fixture = ({ status = 200, credits = true, malformed = false } = {}) => {
  const requests = [];
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push({ url, method: request.method, key: request.headers.get("x-elfa-api-key") });
      const cost = url.pathname.endsWith("event-summary") ? 5 : 1;
      const body = status === 200 ? payloads[url.pathname] : { secret: KEY };
      return Response.json(malformed ? { success: true, data: [] } : body, {
        status,
        headers: credits ? { "x-elfa-credits": String(cost) } : {},
      });
    },
  });
  return { baseUrl: `http://127.0.0.1:${server.port}`, requests };
};

// Six real Bun processes plus Surfpool startup can exceed Bun's default 5s on CI.
const PROCESS_SUITE_TIMEOUT_MS = 30_000;

describe("Free-plan Elfa QA through real CLI and MCP [integration]", () => {
  test(
    "exercises all three GET endpoints on both surfaces and records the contract and billing",
    async () => {
      const provider = fixture();
      const result = await runIrisQa({ ...provider, apiKey: KEY, suite: "elfa-market" });
      expect(result).toMatchObject({
        status: "passed",
        mode: "fixture",
        maxProviderRequests: 6,
        callsStarted: 6,
        reportedCredits: 14,
        usageComplete: true,
      });
      expect(provider.requests).toHaveLength(6);
      for (const request of provider.requests) {
        expect(request).toMatchObject({ method: "GET", key: KEY });
        expect(request.url.searchParams.get("timeWindow")).toBe("24h");
      }
      for (const index of [0, 1]) {
        expect(provider.requests[index].url.pathname).toBe("/v2/aggregations/trending-tokens");
        expect(provider.requests[index].url.searchParams.get("pageSize")).toBe("5");
        expect(provider.requests[index].url.searchParams.get("minMentions")).toBe("5");
        expect(result.cases[index].answer.tokens[0]).toEqual({
          token: "SOL",
          currentMentions: 20,
          previousMentions: 10,
          changePercent: 100,
        });
      }
      for (const index of [2, 3]) {
        expect(provider.requests[index].url.pathname).toBe("/v2/data/token-news");
        expect(provider.requests[index].url.searchParams.get("coinIds")).toBe("solana");
        expect(result.cases[index].answer.mentions[0]).toMatchObject({
          link: LINK,
          viewCount: null,
        });
      }
      for (const index of [4, 5]) {
        expect(provider.requests[index].url.pathname).toBe("/v2/data/event-summary");
        expect(provider.requests[index].url.searchParams.get("keywords")).toBe("Solana");
        expect(provider.requests[index].url.searchParams.get("searchType")).toBe("or");
        expect(result.cases[index].answer.summaries[0].sourceLinks).toEqual([LINK]);
      }
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(IrisQaSchema.safeParse({ ...result, cases: result.cases.slice(0, 2) }).success).toBe(
        false,
      );
      const wrong = result.cases.map((c) => ({ ...c, answer: result.cases[0].answer }));
      expect(IrisQaSchema.safeParse({ ...result, cases: wrong }).success).toBe(false);
    },
    PROCESS_SUITE_TIMEOUT_MS,
  );

  test(
    "missing billing stays unknown, while valid results still work",
    async () => {
      const provider = fixture({ credits: false });
      const result = await runIrisQa({ ...provider, apiKey: KEY, suite: "elfa-market" });
      expect(result).toMatchObject({ status: "passed", reportedCredits: 0, usageComplete: false });
      expect(result.cases.every((c) => c.answer.creditsConsumed === null)).toBe(true);
    },
    PROCESS_SUITE_TIMEOUT_MS,
  );

  test(
    "denied, rate-limited, failed, and malformed responses stop without retries or leaked bodies",
    async () => {
      for (const [status, code] of [
        [403, "IrisAuthFailed"],
        [429, "IrisRateLimited"],
        [503, "IrisHttpError"],
        [200, "IrisResponseInvalid"],
      ]) {
        const provider = fixture({ status, malformed: status === 200 });
        const result = await runIrisQa({ ...provider, apiKey: KEY, suite: "elfa-market" });
        expect(result.callsStarted).toBe(1);
        expect(result.cases[0].code).toBe(code);
        expect(result.cases.slice(1).every((c) => c.status === "skipped")).toBe(true);
        expect(provider.requests).toHaveLength(1);
        expect(JSON.stringify(result)).not.toContain(KEY);
        server.stop(true);
      }
    },
    PROCESS_SUITE_TIMEOUT_MS,
  );
});
