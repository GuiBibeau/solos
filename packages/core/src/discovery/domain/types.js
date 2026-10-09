// @ts-check
import { z } from "zod";

/** A tool as a selector sees it: the four fields a free-text request is matched against. */
export const ToolSummarySchema = z.object({
  name: z.string().min(1).describe("Tool name, e.g. solana_swap_execute_swap"),
  group: z.string().min(1).describe("Tool group, e.g. swap"),
  title: z.string().describe("Human one-liner"),
  description: z.string().describe("Full description the MCP client receives"),
});

/** One ranked tool. Scores are relative to one selector's answer; higher is better. */
export const ToolMatchSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(1).describe("Selector-specific relevance in [0, 1]"),
});

/** The tiers in rank order: a ceiling admits its own tier and every tier before it. */
export const ToolTierSchema = z.enum(["read", "simulate", "execute"]);

/** The compatibility promise a tool makes (ADR-0036); experimental tools are exposed only on request. */
export const StabilitySchema = z.enum(["experimental", "beta", "stable"]);

/**
 * A tool as the catalogue lists it: the selector's four fields, the tier a ceiling gates and the
 * stability label a feature flag gates.
 */
export const CatalogueToolSchema = ToolSummarySchema.extend({
  tier: ToolTierSchema,
  stability: StabilitySchema,
});

/**
 * One search: exactly one of `query`, `group` or `names` (ADR-0029). Only `query` consults a
 * selector; the other two are exact and stay local.
 */
export const SearchToolsInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'The request in your own words, e.g. "swap SOL for USDC". Give exactly one of query, group or names.',
    ),
  group: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "One tool group to list in full: discovery, launch, lend, liquidity, market, perp, portfolio, swap, transfer or wallet.",
    ),
  names: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(255)
    .optional()
    .describe('Exact tool names to look up, e.g. ["solana_swap_get_quote"].'),
  limit: z
    .number()
    .int()
    .min(0)
    .max(255)
    .default(8)
    .describe("How many matches to list; the rest are counted, not listed."),
});

/** @typedef {z.infer<typeof ToolSummarySchema>} ToolSummary */
/** @typedef {z.infer<typeof ToolMatchSchema>} ToolMatch */
/** @typedef {z.infer<typeof ToolTierSchema>} CatalogueTier */
/** @typedef {z.infer<typeof StabilitySchema>} Stability */
/** @typedef {z.infer<typeof CatalogueToolSchema>} CatalogueTool */
/** @typedef {z.infer<typeof SearchToolsInputSchema>} SearchToolsInput */
