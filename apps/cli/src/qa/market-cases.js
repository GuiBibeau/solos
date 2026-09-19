// @ts-check
import { NewsResultSchema, SummaryResultSchema, TrendingResultSchema } from "@solos/core";

/** @typedef {{ name: string; args: string[]; timeoutMs?: number; schema?: import("zod").ZodType<import("./schema.js").QaAnswer> }} QaSpec */

/** Each endpoint is called once via CLI and once via the real stdio MCP server. @type {QaSpec[]} */
export const MARKET_CASES = [
  {
    name: "cli-trending",
    args: ["market", "trending", "--time-window", "24h", "--page-size", "5"],
    schema: TrendingResultSchema,
  },
  {
    name: "mcp-trending",
    args: [
      "mcp",
      "call",
      "solana_market_get_trending_tokens",
      "--args",
      '{"timeWindow":"24h","pageSize":5}',
    ],
    schema: TrendingResultSchema,
  },
  {
    name: "cli-news",
    args: ["market", "news", "--coin-ids", "solana", "--time-window", "24h", "--page-size", "5"],
    schema: NewsResultSchema,
  },
  {
    name: "mcp-news",
    args: [
      "mcp",
      "call",
      "solana_market_get_token_news",
      "--args",
      '{"coinIds":["solana"],"timeWindow":"24h","pageSize":5}',
    ],
    schema: NewsResultSchema,
  },
  {
    name: "cli-summary",
    timeoutMs: 195_000,
    args: ["market", "summary", "--keywords", "Solana", "--time-window", "24h"],
    schema: SummaryResultSchema,
  },
  {
    name: "mcp-summary",
    timeoutMs: 195_000,
    args: [
      "mcp",
      "call",
      "solana_market_get_event_summary",
      "--args",
      '{"keywords":["Solana"],"timeWindow":"24h"}',
    ],
    schema: SummaryResultSchema,
  },
];

/**
 * The canned Elfa provider fixture for the free-plan market QA: the three GET endpoints with
 * documented bodies, optional billing headers, and a malformed mode. Requests are recorded so
 * tests can pin exactly what the QA run sent.
 */

const KEY = "offline-market-key";
const LINK = "https://x.com/example/status/123";
const page = { page: 1, pageSize: 5, total: 1 };
/** @type {Record<string, unknown>} */
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

/** The synthetic key the fixture requires and must never leak into QA output. */
export const QA_KEY = KEY;

/**
 * @param {{ status?: number; credits?: boolean; malformed?: boolean }} [options]
 * @returns {{ baseUrl: string; requests: Array<{ url: URL; method: string; key: string | null }>; stop: () => void }}
 */
export const startMarketQaFixture = ({ status = 200, credits = true, malformed = false } = {}) => {
  const requests = /** @type {Array<{ url: URL; method: string; key: string | null }>} */ ([]);
  const server = Bun.serve({
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
  let isStopped = false;
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => {
      if (isStopped) return;
      isStopped = true;
      server.stop(true);
    },
  };
};
