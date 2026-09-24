// @ts-check
/**
 * The swap reliability report. Swap failures are route-dependent and intermittent, so a single
 * run proves nothing: this counts outcomes across pairs and rounds and puts a number on how
 * often the CLI can actually trade. The JSON is the deliverable, the same as Evidence.
 */
import { z } from "zod";

export const SwapOutcomeSchema = z.object({
  reason: z.string().describe("Typed failure reason, or 'ok' when the attempt succeeded"),
  count: z.number().int().positive(),
});

export const SwapPairReportSchema = z.object({
  name: z.string().min(1).describe("Pair name, e.g. sol-usdc"),
  amount: z.string().describe("Input amount in the input mint's base units"),
  attempts: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1).describe("ok / attempts, 0 when nothing was attempted"),
  p50Ms: z.number().int().nonnegative(),
  p95Ms: z.number().int().nonnegative(),
  outcomes: z.array(SwapOutcomeSchema).describe("Every distinct outcome, most frequent first"),
  skipped: z
    .boolean()
    .describe("The wallet could not fund this pair; it is excluded from the rate, not failed"),
  skipReason: z.string().optional(),
});

export const SwapQaSchema = z.object({
  capability: z.literal("swap"),
  tier: z.enum(["simulate", "execute"]).describe("execute spends real funds; simulate never does"),
  amountLamports: z.string().describe("Round size, in lamports, before per-pair scaling"),
  slippageBps: z.number().int().positive(),
  rounds: z.number().int().positive().describe("Attempts per pair"),
  threshold: z.number().min(0).max(1).describe("Minimum overall rate for a passing run"),
  status: z.enum(["passed", "failed"]),
  skippedPairs: z.array(z.string()).describe("Pairs the wallet could not fund"),
  attempts: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
  p50Ms: z.number().int().nonnegative(),
  p95Ms: z.number().int().nonnegative(),
  pairs: z.array(SwapPairReportSchema),
  startedAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
});

/** @typedef {z.infer<typeof SwapQaSchema>} SwapQa */
/** @typedef {z.infer<typeof SwapPairReportSchema>} SwapPairReport */
