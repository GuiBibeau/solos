// @ts-check
import { z } from "zod";

export const TimeWindowSchema = z.enum(["30m", "1h", "4h", "24h", "7d", "30d"]);
const window = TimeWindowSchema.default("24h").describe("Lookback window; defaults to 24h");
const page = z.number().int().min(1).default(1).describe("Page number, starting at 1");
const pageSize = z.number().int().min(1).max(50).default(10).describe("Results per page, 1–50");
const terms = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(100)
      .refine((s) => !s.includes(",")),
  )
  .min(1)
  .max(10);

export const TrendingInputSchema = z.object({
  timeWindow: window,
  page,
  pageSize,
  minMentions: z.number().int().min(1).default(5).describe("Minimum mentions per token"),
});
export const NewsInputSchema = z.object({
  coinIds: terms.describe("CoinGecko coin IDs, e.g. [solana]; not tickers or mint addresses"),
  timeWindow: window,
  page,
  pageSize,
});
export const SummaryInputSchema = z.object({
  keywords: terms.describe("One to ten search terms, e.g. [Solana, SOL]"),
  timeWindow: window,
  searchType: z
    .enum(["and", "or"])
    .default("or")
    .describe("Match all terms (and) or any term (or)"),
});

/** @typedef {z.input<typeof TrendingInputSchema>} TrendingInput */
/** @typedef {z.input<typeof NewsInputSchema>} NewsInput */
/** @typedef {z.input<typeof SummaryInputSchema>} SummaryInput */

export const PageSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export const TrendingTokenSchema = z.object({
  token: z.string().min(1),
  currentMentions: z.number().nonnegative(),
  previousMentions: z.number().nonnegative(),
  changePercent: z.number(),
});
const count = z.number().nonnegative().nullable();
export const NewsMentionSchema = z.object({
  tweetId: z.string().min(1),
  link: z.url({ protocol: /^https?$/ }),
  mentionedAt: z.iso.datetime({ offset: true }),
  type: z.enum(["repost", "post", "quote", "reply", "note", "article"]),
  likeCount: count,
  repostCount: count,
  viewCount: count,
  quoteCount: count,
  replyCount: count,
  bookmarkCount: count,
  repostBreakdown: z.object({ ct: z.number().nonnegative(), smart: z.number().nonnegative() }),
});
export const EventSummarySchema = z.object({
  summary: z.string().trim().min(1),
  sourceLinks: z.array(z.url({ protocol: /^https?$/ })),
  tweetIds: z.array(z.string().min(1)),
});
const receipt = {
  provider: z.literal("elfa"),
  creditsConsumed: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Reported call credits; null if unavailable"),
  receivedAt: z.number().int().describe("Local receipt time in milliseconds, not source freshness"),
};
export const TrendingResultSchema = z.object({
  ...receipt,
  tokens: z.array(TrendingTokenSchema),
  pagination: PageSchema,
});
export const NewsResultSchema = z.object({
  ...receipt,
  mentions: z.array(NewsMentionSchema),
  pagination: PageSchema,
});
export const SummaryResultSchema = z.object({
  ...receipt,
  summaries: z.array(EventSummarySchema),
});
/** @typedef {z.infer<typeof TrendingResultSchema>} TrendingResult */
/** @typedef {z.infer<typeof NewsResultSchema>} NewsResult */
/** @typedef {z.infer<typeof SummaryResultSchema>} SummaryResult */
