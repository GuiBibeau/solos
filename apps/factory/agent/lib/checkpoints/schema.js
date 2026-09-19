// @ts-check
import { z } from "zod";

const Id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9._:/#-]+$/);
const WorkItemId = Id.refine((value) => !value.includes(".."), "Invalid work item id");
const Sha = z.string().regex(/^[a-f\d]{40}$/);
const TaskId = z.string().regex(/^task_[a-f\d]{24}$/);

export const StationSchema = z.enum([
  "classifier",
  "researcher",
  "analyst",
  "implementer",
  "reviewer",
]);

export const OutcomeSchema = z.enum([
  "active",
  "completed",
  "failed",
  "budget_paused",
  "superseded",
  "blocked",
]);

export const UsageSchema = z
  .object({
    accountingScope: z.enum(["station", "root_aggregate"]),
    billedCostSource: z.string().min(1).max(200).optional(),
    billedCostUsd: z.number().nonnegative().optional(),
    cachedInputTokens: z.number().int().nonnegative().optional(),
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
  })
  .refine((usage) => usage.billedCostUsd === undefined || usage.billedCostSource !== undefined, {
    message: "Billed cost requires an authoritative source",
    path: ["billedCostSource"],
  });

const EscalationSchema = z.object({
  deliveryKey: z.string().min(1).max(200),
  deliveredAt: z.iso.datetime().optional(),
  id: z.string().regex(/^esc_[a-f\d]{24}$/),
  message: z.string().min(1).max(1200),
  queuedAt: z.iso.datetime(),
});

const BlockerSchema = z.object({
  attemptedCorrection: z.string().min(1).max(1000),
  attempts: z.number().int().positive(),
  escalation: EscalationSchema.optional(),
  fingerprint: z.string().min(1).max(200),
  lastObservedAt: z.iso.datetime(),
});

export const StationCheckpointSchema = z.object({
  artifactIds: z.array(Id).max(20).default([]),
  branch: z
    .object({
      base: z.string().min(1).max(200).optional(),
      dirty: z.boolean(),
      dirtyFiles: z.array(z.string().min(1).max(500)).max(100).default([]),
      head: Sha.optional(),
      name: z.string().min(1).max(200).optional(),
    })
    .optional(),
  blocker: BlockerSchema.optional(),
  cursor: z.string().min(1).max(2000).optional(),
  diagnostics: z.array(z.string().min(1).max(1000)).max(20).default([]),
  latestOperation: z.object({
    at: z.iso.datetime(),
    name: z.string().min(1).max(200),
    status: z.enum(["running", "passed", "failed", "cancelled"]),
  }),
  nextMilestone: z.string().min(1).max(1000),
  outcome: OutcomeSchema,
  revision: z.number().int().positive(),
  rootRunId: Id,
  station: StationSchema,
  stationRunId: Id.optional(),
  supersededTaskIds: z.array(TaskId).max(20).default([]),
  taskId: TaskId.describe("Runtime-derived Eve task id that owns this checkpoint"),
  updatedAt: z.iso.datetime(),
  usage: UsageSchema.optional(),
  verification: z.object({
    stage: z.string().min(1).max(100),
    status: z.enum(["not_started", "running", "passed", "failed", "blocked"]),
  }),
  workItem: WorkItemId,
});

/** @typedef {z.infer<typeof StationCheckpointSchema>} StationCheckpoint */
