// @ts-check
import { EventSummarySchema, NewsMentionSchema, PageSchema } from "@solos/core";
import { z } from "zod";
import { readElfa } from "./elfa-read.js";

const TrendingEnvelope = z
  .object({
    success: z.literal(true),
    data: PageSchema.extend({
      data: z.array(
        z.object({
          token: z.string().min(1),
          current_count: z.number().nonnegative(),
          previous_count: z.number().nonnegative(),
          change_percent: z.number(),
        }),
      ),
    }),
  })
  .transform(({ data }) => ({
    tokens: data.data.map((t) => ({
      token: t.token,
      currentMentions: t.current_count,
      previousMentions: t.previous_count,
      changePercent: t.change_percent,
    })),
    pagination: { page: data.page, pageSize: data.pageSize, total: data.total },
  }));
const NewsEnvelope = z
  .object({
    success: z.literal(true),
    data: z.array(NewsMentionSchema),
    metadata: PageSchema,
  })
  .transform(({ data, metadata }) => ({ mentions: data, pagination: metadata }));
const SummaryEnvelope = z
  .object({
    success: z.literal(true),
    data: z.array(EventSummarySchema),
  })
  .transform(({ data }) => ({ summaries: data }));

/** @param {import("./elfa-read.js").ElfaReadConfig} config
 * @returns {Pick<import("@solos/core").MarketIntelligenceShape, "trending" | "news" | "summary">}
 */
export const discoveryAdapter = (config) => ({
  trending: (input) =>
    readElfa(
      config,
      {
        path: "/v2/aggregations/trending-tokens",
        query: { ...input },
      },
      TrendingEnvelope,
    ),
  news: ({ coinIds, ...input }) =>
    readElfa(
      config,
      {
        path: "/v2/data/token-news",
        query: { ...input, coinIds: coinIds.join(",") },
      },
      NewsEnvelope,
    ),
  summary: ({ keywords, ...input }) =>
    readElfa(
      { ...config, timeoutMs: config.timeoutMs ?? 120_000 },
      {
        path: "/v2/data/event-summary",
        query: { ...input, keywords: keywords.join(",") },
      },
      SummaryEnvelope,
    ),
});
