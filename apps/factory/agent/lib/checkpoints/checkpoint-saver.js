// @ts-check
import { z } from "zod";
import { StationCheckpointSchema, StationSchema } from "./schema.js";

const WritableBlockerSchema = z.object({
  attemptedCorrection: z.string().min(1).max(1000),
  attempts: z.number().int().positive(),
  fingerprint: z.string().min(1).max(200),
  lastObservedAt: z.iso.datetime(),
});

const WritableCheckpointSchema = StationCheckpointSchema.omit({
  stationRunId: true,
  supersededTaskIds: true,
  taskId: true,
  usage: true,
}).extend({ blocker: WritableBlockerSchema.optional() });

/** @param {CheckpointStore} checkpoints @param {z.infer<typeof WritableCheckpointSchema>} input @param {string} taskId */
const supersededOwners = async (checkpoints, input, taskId) => {
  const stored = await checkpoints.read(input);
  const checkpoint = stored.checkpoint;
  if (checkpoint === undefined || checkpoint.taskId === taskId)
    return checkpoint?.supersededTaskIds ?? [];
  return [...checkpoint.supersededTaskIds, checkpoint.taskId].slice(-20);
};

/** @param {z.infer<typeof StationSchema>} station */
export const saveInputSchema = (station) =>
  WritableCheckpointSchema.extend({ station: z.literal(StationSchema.parse(station)) });

/** @param {CheckpointStore} checkpoints @param {RuntimeObserver} observer @param {TaskBindings} bindings */
export const createCheckpointSaver =
  (checkpoints, observer, bindings) =>
  async (
    /** @type {unknown} */ candidate,
    /** @type {import("eve/tools").SessionContext} */ ctx,
  ) => {
    const input = WritableCheckpointSchema.parse(candidate);
    const ownership = await bindings.read({
      stationRunId: ctx.session.id,
      turnId: ctx.session.turn.id,
    });
    if (
      !ownership.found ||
      ownership.binding.rootRunId !== input.rootRunId ||
      ownership.binding.station !== input.station ||
      ownership.binding.workItem !== input.workItem
    )
      return { error: "Current station task binding is unavailable.", saved: false };
    const observed = await observer.read(ctx.session.id);
    const usage = observed.found ? observed.observation?.usage : undefined;
    const supersededTaskIds = await supersededOwners(checkpoints, input, ownership.binding.taskId);
    return checkpoints.save({
      ...input,
      stationRunId: ctx.session.id,
      supersededTaskIds,
      taskId: ownership.binding.taskId,
      ...(usage !== undefined && { usage }),
    });
  };

/** @typedef {{read: (input: {rootRunId: string; station: string; workItem: string}) => Promise<{checkpoint?: import("./schema.js").StationCheckpoint; found: boolean}>; save: (candidate: unknown) => Promise<unknown>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}>}} RuntimeObserver */
/** @typedef {{read: (identity: {stationRunId: string; turnId: string}) => Promise<{found: false} | {binding: {rootRunId: string; station: string; taskId: string; workItem: string}; found: true}>}} TaskBindings */
