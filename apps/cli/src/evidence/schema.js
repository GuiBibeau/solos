// @ts-check
/**
 * Evidence: the machine-readable proof that `solos dev verify` ran on a given commit.
 * The JSON is the deliverable; PRs paste it under `## Evidence` and CI re-checks it.
 */
import { z } from "zod";

export const ScopeSchema = z
  .enum(["check", "unit", "full"])
  .describe("check: static checks; unit: + unit tests; full: + integration tests on Surfpool");

/** @typedef {z.infer<typeof ScopeSchema>} Scope */

export const StepSchema = z.object({
  name: z.string().min(1).describe("Short step name, e.g. lint"),
  command: z.string().min(1).describe("Command line that was (or would have been) run"),
  ok: z.boolean().nullable().describe("true passed, false failed, null skipped after a failure"),
  ms: z.number().int().nonnegative().describe("Wall-clock duration in milliseconds"),
  summary: z.string().max(200).describe("Last non-empty output line, truncated to 200 chars"),
});

/** @typedef {z.infer<typeof StepSchema>} Step */

export const EvidenceSchema = z.object({
  ok: z.boolean().describe("Every step passed"),
  sha: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .describe("git rev-parse HEAD"),
  dirty: z.boolean().describe("Working tree had uncommitted changes (git status --porcelain)"),
  scope: ScopeSchema,
  versions: z.object({
    bun: z.string().min(1),
    surfpool: z.string().nullable().describe("null when surfpool is not on PATH"),
  }),
  steps: z.array(StepSchema),
  startedAt: z.iso.datetime().describe("ISO 8601 start time"),
  durationMs: z.number().int().nonnegative(),
});

/** @typedef {z.infer<typeof EvidenceSchema>} Evidence */
