// @ts-check
import { StationCheckpointSchema } from "./schema.js";

export const issue18Checkpoint = StationCheckpointSchema.parse({
  artifactIds: ["analysis-issue-18-a1b2c3"],
  blocker: {
    attemptedCorrection: "Kept the checkout and narrowed the next step to static checks.",
    attempts: 2,
    fingerprint: "issue-18-static-types",
    lastObservedAt: "2026-09-19T03:44:51.000Z",
  },
  branch: {
    base: "main",
    dirty: true,
    dirtyFiles: ["packages/core/src/swap/tools/swap.js"],
    head: "a".repeat(40),
    name: "factory/feat-swap-execute",
  },
  cursor: "trace-page-4",
  diagnostics: [
    "type error: order input",
    "type error: minimum output",
    "type error: route plan",
    "type error: transaction response",
    "unresolved main alignment",
    "oversized validator concern",
  ],
  latestOperation: {
    at: "2026-09-19T03:44:51.000Z",
    name: "bun run solos dev check",
    status: "failed",
  },
  nextMilestone: "Run the static-check milestone and fix the four retained type errors.",
  outcome: "budget_paused",
  revision: 2,
  rootRunId: "wrun_41M2VNKAF10GJ11XJF5TMXY2ZZ",
  station: "implementer",
  stationRunId: "wrun_41M2VQP9DY0GX9YZMXQ7XEKV1T",
  taskId: "implement-issue-18",
  updatedAt: "2026-09-19T03:44:51.000Z",
  usage: { accountingScope: "station", inputTokens: 37_200_000 },
  verification: { stage: "static-check", status: "failed" },
  workItem: "GuiBibeau/solos#18",
});
