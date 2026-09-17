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
