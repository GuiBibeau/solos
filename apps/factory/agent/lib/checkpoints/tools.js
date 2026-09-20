// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { createCheckpointReader } from "./checkpoint-reader.js";
import { createCheckpointSaver, saveInputSchema } from "./checkpoint-saver.js";
import { runtimeObserver } from "./runtime-observer.js";
import { StationCheckpointSchema, StationSchema, UsageSchema } from "./schema.js";
import { checkpointStore } from "./store.js";
import { taskBindingStore } from "./task-binding.js";

const BlockerStatusSchema = z.object({
  attemptedCorrection: z.string().optional(),
  attempts: z.number().int().positive().optional(),
  escalation: StationCheckpointSchema.shape.blocker.unwrap().shape.escalation.optional(),
  fingerprint: z.string().optional(),
  lastOperation: StationCheckpointSchema.shape.latestOperation.optional(),
  shouldEscalate: z.boolean(),
});
const StatusViewSchema = z.object({
  cursor: z.string().optional(),
  latestActivityAt: z.iso.datetime(),
  redispatch: z.literal(false),
  stationRunId: z.string().optional(),
  status: z.enum([
    "active",
    "blocked",
    "budget_paused",
    "completed",
    "failed",
    "superseded",
    "unknown",
  ]),
  taskId: StationCheckpointSchema.shape.taskId,
});
const ReadInput = z.object({
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  unchangedObservations: z.number().int().nonnegative().optional(),
  workItem: z.string().min(1).max(200),
});
const ReadOutput = z.object({
  checkpoint: StationCheckpointSchema.optional(),
  blocker: BlockerStatusSchema.optional(),
  backoffMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  found: z.boolean(),
  usage: UsageSchema.optional(),
  view: StatusViewSchema.optional(),
});

export const readCheckpoint = createCheckpointReader(
  checkpointStore,
  runtimeObserver,
  taskBindingStore,
);

const saveCheckpoint = createCheckpointSaver(checkpointStore, runtimeObserver, taskBindingStore);

/** @param {z.infer<typeof StationSchema>} station @param {typeof saveCheckpoint} execute */
export const createSaveCheckpointTool = (station, execute) =>
  defineTool({
    description:
      "Save the station's restart-safe progress after a meaningful milestone and before a budget pause. " +
      "Record actual operations and unresolved diagnostics; the runtime binds the current task owner. " +
      "A checkpoint never changes a budget.",
    execute,
    inputSchema: saveInputSchema(station),
    outputSchema: z.object({
      error: z.string().optional(),
      saved: z.boolean(),
      updatedAt: z.string().optional(),
    }),
  });

/** @param {z.infer<typeof StationSchema>} station */
export const saveCheckpointTool = (station) => createSaveCheckpointTool(station, saveCheckpoint);

export const readCheckpointTool = () =>
  defineTool({
    description:
      "Read a station checkpoint joined with its durable current task and runtime-owned activity. " +
      "A missing observation returns unknown and never authorizes redispatch. Token usage is a " +
      "guardrail counter, not an invoice; billed cost appears only from the runtime provider.",
    execute: readCheckpoint,
    inputSchema: ReadInput,
    outputSchema: ReadOutput,
  });
