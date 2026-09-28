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

/** @typedef {z.infer<typeof ToolSummarySchema>} ToolSummary */
/** @typedef {z.infer<typeof ToolMatchSchema>} ToolMatch */
