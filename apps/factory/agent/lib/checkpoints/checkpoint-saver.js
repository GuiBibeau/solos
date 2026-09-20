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
  cursor: true,
  outcome: true,
  revision: true,
  stationRunId: true,
  supersededTaskIds: true,
  taskId: true,
  updatedAt: true,
  usage: true,
}).extend({ blocked: z.boolean().default(false), blocker: WritableBlockerSchema.optional() });

/** @param {import("./schema.js").StationCheckpoint | undefined} checkpoint @param {string} taskId */
const supersededOwners = (checkpoint, taskId) => {
  if (checkpoint === undefined || checkpoint.taskId === taskId)
    return checkpoint?.supersededTaskIds ?? [];
  return [...checkpoint.supersededTaskIds, checkpoint.taskId].slice(-20);
};

/** @param {import("./runtime-observation.js").RuntimeObservation["taskOutcome"]} outcome @param {boolean} blocked */
const checkpointOutcome = (outcome, blocked) => {
  if (outcome === "cancelled") return "failed";
  if (outcome !== undefined && outcome !== "active") return outcome;
  return blocked ? "blocked" : (outcome ?? "active");
};

/** @param {{rootRunId: string; station: string; workItem: string}} binding @param {z.infer<typeof WritableCheckpointSchema>} input */
const hasCheckpointOwnership = (binding, input) =>
  binding.rootRunId === input.rootRunId &&
  binding.station === input.station &&
  binding.workItem === input.workItem;

/** @param {import("./runtime-observation.js").RuntimeObservation | undefined} observation @param {import("./schema.js").StationCheckpoint | undefined} previous @param {boolean} blocked */
const runtimeFields = (observation, previous, blocked) => {
  const cursor = observation?.cursor ?? previous?.cursor;
  return {
    cursor,
    outcome: checkpointOutcome(observation?.taskOutcome, blocked),
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    usage: observation?.usage,
  };
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
    if (!ownership.found)
      return { error: "Current station task binding is unavailable.", saved: false };
    if (!hasCheckpointOwnership(ownership.binding, input))
      return { error: "Current station task binding is unavailable.", saved: false };
    const observed = await observer.read(ctx.session.id);
    const stored = await checkpoints.read(input);
    const previous = stored.checkpoint;
    const supersededTaskIds = supersededOwners(previous, ownership.binding.taskId);
    const blocked = input.blocked && input.blocker !== undefined;
    return checkpoints.save({
      ...input,
      ...runtimeFields(observed.observation, previous, blocked),
      stationRunId: ctx.session.id,
      supersededTaskIds,
      taskId: ownership.binding.taskId,
    });
  };

/** @typedef {{read: (input: {rootRunId: string; station: string; workItem: string}) => Promise<{checkpoint?: import("./schema.js").StationCheckpoint; found: boolean}>; save: (candidate: unknown) => Promise<unknown>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}>}} RuntimeObserver */
/** @typedef {{read: (identity: {stationRunId: string; turnId: string}) => Promise<{found: false} | {binding: {rootRunId: string; station: string; taskId: string; workItem: string}; found: true}>}} TaskBindings */
