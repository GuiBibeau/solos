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
  taskId: true,
  usage: true,
}).extend({ blocker: WritableBlockerSchema.optional() });

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
    const ownership = await bindings.read(ctx.session.id);
    if (!ownership.found)
      return { error: "Current station task binding is unavailable.", saved: false };
    const observed = await observer.read(ctx.session.id);
    const usage = observed.found ? observed.observation?.usage : undefined;
    return checkpoints.save({
      ...input,
      stationRunId: ctx.session.id,
      taskId: ownership.binding.taskId,
      ...(usage !== undefined && { usage }),
    });
  };

/** @typedef {{save: (candidate: unknown) => Promise<unknown>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}>}} RuntimeObserver */
/** @typedef {{read: (id: string) => Promise<{found: false} | {binding: {taskId: string}; found: true}>}} TaskBindings */
