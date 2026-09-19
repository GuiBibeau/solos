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
  escalationEmittedAt: z.iso.datetime().optional(),
  escalationMessage: z.string().optional(),
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
    const checkpoint = withObservedUsage(result.checkpoint, observed);
    return {
      ...result,
      checkpoint,
      blocker: blockerStatus(checkpoint),
      backoffMs: monitoringBackoffMs(unchangedObservations ?? 0),
      view: stationView(checkpoint, observation),
    };
  };

/** @param {z.infer<typeof StationCheckpointSchema>} checkpoint @param {Awaited<ReturnType<typeof runtimeObserver.read>>} observed */
const withObservedUsage = (checkpoint, observed) => {
  const usage = observed.found ? observed.observation?.usage : undefined;
  return usage === undefined ? checkpoint : { ...checkpoint, usage };
};

export const readCheckpoint = createCheckpointReader(checkpointStore, runtimeObserver);

const WritableBlockerSchema = z.object({
  attemptedCorrection: z.string().min(1).max(1000),
  attempts: z.number().int().positive(),
  fingerprint: z.string().min(1).max(200),
  lastObservedAt: z.iso.datetime(),
});
const WritableCheckpointSchema = StationCheckpointSchema.omit({
  stationRunId: true,
  taskId: true,
  usage: true,
}).extend({ blocker: WritableBlockerSchema.optional() });

/** @param {z.infer<typeof StationSchema>} station */
const saveInputSchema = (station) =>
  WritableCheckpointSchema.extend({ station: z.literal(station) });

/** @param {typeof checkpointStore} checkpoints @param {typeof runtimeObserver} observer */
export const createCheckpointSaver =
  (checkpoints, observer) =>
  async (
    /** @type {unknown} */ candidate,
    /** @type {import("eve/tools").SessionContext} */ ctx,
  ) => {
    const input = WritableCheckpointSchema.parse(candidate);
    const observed = await observer.read(ctx.session.id);
    const usage = observed.found ? observed.observation?.usage : undefined;
    return checkpoints.save({
      ...input,
      stationRunId: ctx.session.id,
      taskId: ctx.session.parent?.callId ?? ctx.session.turn.id,
      ...(usage !== undefined && { usage }),
    });
  };

const saveCheckpoint = createCheckpointSaver(checkpointStore, runtimeObserver);

/** @param {z.infer<typeof StationSchema>} station */
export const saveCheckpointTool = (station) =>
  defineTool({
    description:
      "Save the station's restart-safe progress after a meaningful milestone and before a budget pause. " +
      "Record actual operations and unresolved diagnostics; a checkpoint never changes a budget.",
    execute: saveCheckpoint,
    inputSchema: saveInputSchema(station),
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
