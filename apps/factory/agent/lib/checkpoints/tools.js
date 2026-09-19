// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { StationCheckpointSchema, StationSchema } from "./schema.js";
import { blockerStatus, monitoringBackoffMs, stationView } from "./status.js";
import { checkpointStore } from "./store.js";

const ObservationSchema = z.object({
  cursor: z.string().min(1).max(2000).optional(),
  latestActivityAt: z.iso.datetime().optional(),
  observationTimedOut: z.boolean().optional(),
  replacementActive: z.boolean().optional(),
  sessionStatus: z.string().max(100).optional(),
  taskOutcome: z.enum(["active", "completed", "failed", "cancelled", "superseded"]).optional(),
  unchangedObservations: z.number().int().nonnegative().optional(),
});
const BlockerStatusSchema = z.object({
  attemptedCorrection: z.string().optional(),
  attempts: z.number().int().positive().optional(),
  fingerprint: z.string().optional(),
  lastOperation: StationCheckpointSchema.shape.latestOperation.optional(),
  shouldEscalate: z.boolean(),
});
const StatusViewSchema = z.object({
  cursor: z.string().optional(),
  latestActivityAt: z.iso.datetime(),
  redispatch: z.literal(false),
  status: z.enum([
    "active",
    "blocked",
    "budget_paused",
    "completed",
    "failed",
    "superseded",
    "unknown",
  ]),
});
const ReadInput = z.object({
  observation: ObservationSchema.optional(),
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  workItem: z.string().min(1).max(200),
});
const ReadOutput = z.object({
  checkpoint: StationCheckpointSchema.optional(),
  blocker: BlockerStatusSchema.optional(),
  backoffMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
  found: z.boolean(),
  view: StatusViewSchema.optional(),
});

/** @param {z.infer<typeof ReadInput>} input */
const read = async ({ workItem, rootRunId, station, observation }) => {
  const result = await checkpointStore.read({ rootRunId, station, workItem });
  if (!result.found || result.checkpoint === undefined) return result;
  return {
    ...result,
    blocker: blockerStatus(result.checkpoint),
    ...(observation !== undefined && {
      backoffMs: monitoringBackoffMs(observation.unchangedObservations ?? 0),
      view: stationView(result.checkpoint, observation),
    }),
  };
};

/** @param {z.infer<typeof StationSchema>} station */
export const saveCheckpointTool = (station) =>
  defineTool({
    description:
      "Save the station's restart-safe progress after a meaningful milestone and before a budget pause. " +
      "Record actual operations and unresolved diagnostics; a checkpoint never changes a budget.",
    execute: checkpointStore.save,
    inputSchema: StationCheckpointSchema.extend({ station: z.literal(station) }),
    outputSchema: z.object({
      error: z.string().optional(),
      saved: z.boolean(),
      updatedAt: z.string().optional(),
    }),
  });

export const readCheckpointTool = () =>
  defineTool({
    description:
      "Read the latest durable checkpoint for one work item and station. Use fresh task activity and its " +
      "cursor with this record; never treat a stale session label as current progress.",
    execute: read,
    inputSchema: ReadInput,
    outputSchema: ReadOutput,
  });
