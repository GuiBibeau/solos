// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { NewsInputSchema, SummaryInputSchema, TrendingInputSchema } from "../domain/discovery.js";
import { getEventSummary, getTokenNews, getTrendingTokens } from "../use-cases/discovery.js";

export const trendingTokensTool = defineTool({
  name: "solana_market_get_trending_tokens",
  group: "market",
  tier: "read",
  title: "Find trending tokens",
  description:
    "Find tokens gaining social attention over a time window, ranked by mentions. Returns counts, not prices or sentiment. Elfa's experimental endpoint; consumes API credits, available on Free.",
  input: TrendingInputSchema,
  run: getTrendingTokens,
});
export const tokenNewsTool = defineTool({
  name: "solana_market_get_token_news",
  group: "market",
  tier: "read",
  title: "Find token news",
  description:
    "Find recent news-source posts about CoinGecko coin IDs. Returns X post links, timestamps and engagement, not article or tweet text. Consumes Elfa API credits, available on Free.",
  input: NewsInputSchema,
  run: getTokenNews,
});
export const eventSummaryTool = defineTool({
  name: "solana_market_get_event_summary",
  group: "market",
  tier: "read",
  title: "Summarize market events",
  description:
    "Summarize recent events matching keywords, with source links supplied by Elfa. Costs 5 Elfa credits per call, available on Free. May take up to 120 seconds or return no summaries for a quiet window.",
  input: SummaryInputSchema,
  run: getEventSummary,
});
