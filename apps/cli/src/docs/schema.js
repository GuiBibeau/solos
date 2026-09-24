// @ts-check
/**
 * The docs gate's report: which generated regions matched the tool registry, and what drifted.
 * Printed as JSON like every other `solos` result, so CI and agents assert on it rather than
 * reading prose.
 */
import { z } from "zod";

export const RegionStatusSchema = z
  .enum(["current", "stale", "written", "missing"])
  .describe("current: matches; stale: drifted; written: rewritten by --write; missing: no markers");

/** @typedef {z.infer<typeof RegionStatusSchema>} RegionStatus */

export const RegionReportSchema = z.object({
  file: z.string().min(1).describe("Repo-relative document holding the region"),
  region: z.string().min(1).describe("Region name, as it appears in the generated markers"),
  status: RegionStatusSchema,
  detail: z.string().describe("Which rows drifted, named; empty when the region is current"),
});

export const DocsReportSchema = z.object({
  ok: z.boolean().describe("Every region matched the registry, or was rewritten by --write"),
  write: z.boolean().describe("Regions were rewritten in place rather than only compared"),
  regions: z.array(RegionReportSchema),
});

/** @typedef {z.infer<typeof DocsReportSchema>} DocsReport */
