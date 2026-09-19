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
  usage: true,
}).extend({ blocker: WritableBlockerSchema.optional() });

/** @param {z.infer<typeof StationSchema>} station */
export const saveInputSchema = (station) =>
  WritableCheckpointSchema.extend({ station: z.literal(StationSchema.parse(station)) });

/** @param {CheckpointStore} checkpoints @param {RuntimeObserver} observer */
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
      ...(usage !== undefined && { usage }),
    });
  };

/** @typedef {{save: (candidate: unknown) => Promise<unknown>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}>}} RuntimeObserver */
