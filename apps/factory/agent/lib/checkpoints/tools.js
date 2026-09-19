// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { runtimeObserver } from "./runtime-observer.js";
import { StationCheckpointSchema, StationSchema } from "./schema.js";
import { blockerStatus, monitoringBackoffMs, stationView } from "./status.js";
import { checkpointStore } from "./store.js";

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
  view: StatusViewSchema.optional(),
});

/** @param {typeof checkpointStore} checkpoints @param {typeof runtimeObserver} observer */
export const createCheckpointReader =
  (checkpoints, observer) => async (/** @type {z.infer<typeof ReadInput>} */ input) => {
    const { workItem, rootRunId, station, unchangedObservations } = input;
    const result = await checkpoints.read({ rootRunId, station, workItem });
    if (!result.found || result.checkpoint === undefined) return result;
    const observed =
      result.checkpoint.stationRunId === undefined
        ? { found: false }
        : await observer.read(result.checkpoint.stationRunId);
    const observation =
      observed.found && observed.observation !== undefined
        ? observed.observation
        : { observationTimedOut: /** @type {const} */ (true) };
    return {
      ...result,
      blocker: blockerStatus(result.checkpoint),
      backoffMs: monitoringBackoffMs(unchangedObservations ?? 0),
      view: stationView(result.checkpoint, observation),
    };
  };

export const readCheckpoint = createCheckpointReader(checkpointStore, runtimeObserver);

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
      "Read a station checkpoint joined with runtime-owned activity for its stored station run id. " +
      "A missing observation returns unknown and never authorizes redispatch.",
    execute: readCheckpoint,
    inputSchema: ReadInput,
    outputSchema: ReadOutput,
  });
