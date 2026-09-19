// @ts-check
import { readDocument, writeDocument } from "../blob.js";
import { checkpointKey } from "./config.js";
import { StationCheckpointSchema } from "./schema.js";

/** @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint */
/** @typedef {{
 * read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true; uploadedAt: string}>;
 * write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>;
 * }} CheckpointIo
 */

/** @param {StationCheckpoint} current @param {StationCheckpoint} incoming */
const canReplace = (current, incoming) => {
  if (incoming.revision !== current.revision + 1) return false;
  if (incoming.taskId === current.taskId) return true;
  return incoming.supersededTaskIds.includes(current.taskId);
};

/** @param {CheckpointIo} io @param {string} key @param {StationCheckpoint} checkpoint */
const persist = async (io, key, checkpoint) => {
  const stored = await io.read(key);
  if (stored.found) {
    const current = StationCheckpointSchema.parse(JSON.parse(stored.content));
    if (!canReplace(current, checkpoint))
      return { error: "Stale checkpoint revision or task owner.", saved: false };
    await io.write(key, JSON.stringify(checkpoint), {
      allowOverwrite: true,
      contentType: "application/json",
      ifMatch: stored.etag,
    });
  } else {
    if (checkpoint.revision !== 1) return { error: "Initial revision must be 1.", saved: false };
    await io.write(key, JSON.stringify(checkpoint), {
      allowOverwrite: false,
      contentType: "application/json",
    });
  }
  return { saved: true, updatedAt: checkpoint.updatedAt };
};

/** @param {CheckpointIo} io @param {unknown} candidate */
const save = async (io, candidate) => {
  const result = StationCheckpointSchema.safeParse(candidate);
  if (!result.success) return { error: "Invalid checkpoint.", saved: false };
  const checkpoint = result.data;
  const key = checkpointKey(checkpoint.workItem, checkpoint.rootRunId, checkpoint.station);
  if (key === null) return { error: "Invalid checkpoint identity.", saved: false };
  try {
    return await persist(io, key, checkpoint);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Checkpoint save failed.",
      saved: false,
    };
  }
};

/** @param {CheckpointIo} io @param {{rootRunId: string; station: string; workItem: string}} input */
const read = async (io, { workItem, rootRunId, station }) => {
  const key = checkpointKey(workItem, rootRunId, station);
  if (key === null) return { found: false };
  try {
    const document = await io.read(key);
    if (!document.found) return { found: false };
    return {
      checkpoint: StationCheckpointSchema.parse(JSON.parse(document.content)),
      found: true,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Checkpoint read failed.",
      found: false,
    };
  }
};

/** @param {CheckpointIo} io @param {{fingerprint: string; rootRunId: string; station: string; workItem: string}} input */
const claimEscalation = async (io, input) => {
  const key = checkpointKey(input.workItem, input.rootRunId, input.station);
  if (key === null) return { claimed: false, reason: "invalid_identity" };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = await io.read(key);
    if (!document.found) return { claimed: false, reason: "checkpoint_missing" };
    const current = StationCheckpointSchema.parse(JSON.parse(document.content));
    const ineligible = escalationIneligibleReason(current, input.fingerprint);
    if (ineligible !== null) return { claimed: false, reason: ineligible };
    const next = escalatedCheckpoint(current);
    try {
      await io.write(key, JSON.stringify(next), {
        allowOverwrite: true,
        contentType: "application/json",
        ifMatch: document.etag,
      });
      return { claimed: true, revision: next.revision };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    claimed: false,
    reason: lastError instanceof Error ? lastError.message : "claim_conflict",
  };
};

/** @param {StationCheckpoint} checkpoint @param {string} fingerprint */
const escalationIneligibleReason = (checkpoint, fingerprint) => {
  if (checkpoint.blocker?.fingerprint !== fingerprint) return "blocker_changed";
  if (checkpoint.blocker.escalationEmittedAt !== undefined) return "already_claimed";
  if (checkpoint.blocker.attempts < 2) return "correction_pending";
  return null;
};

/** @param {StationCheckpoint} checkpoint */
const escalatedCheckpoint = (checkpoint) => {
  const updatedAt = new Date().toISOString();
  return {
    ...checkpoint,
    blocker: { ...checkpoint.blocker, escalationEmittedAt: updatedAt },
    revision: checkpoint.revision + 1,
    updatedAt,
  };
};

/** @param {CheckpointIo} io */
export const createCheckpointStore = (io) => ({
  claimEscalation: (
    /** @type {{fingerprint: string; rootRunId: string; station: string; workItem: string}} */ input,
  ) => claimEscalation(io, input),
  read: (/** @type {{rootRunId: string; station: string; workItem: string}} */ input) =>
    read(io, input),
  save: (/** @type {unknown} */ candidate) => save(io, candidate),
});

export const checkpointStore = createCheckpointStore({ read: readDocument, write: writeDocument });
