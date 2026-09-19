// @ts-check
import { readDocument, writeDocument } from "../blob.js";
import { checkpointKey } from "./config.js";
import {
  deliveredCheckpoint,
  ineligibleReason,
  outboxResult,
  queuedCheckpoint,
} from "./escalation-state.js";
import { StationCheckpointSchema } from "./schema.js";

/** @typedef {{fingerprint: string; rootRunId: string; station: string; workItem: string}} EscalationInput */
/** @typedef {EscalationInput & {escalationId: string}} AcknowledgeInput */

const writeOptions = (/** @type {string} */ etag) => ({
  allowOverwrite: true,
  contentType: "application/json",
  ifMatch: etag,
});

const failedResult = (/** @type {unknown} */ error) => ({
  delivery: "ineligible",
  reason: error instanceof Error ? error.message : "outbox_conflict",
});

/** @param {EscalationIo} io @param {string} key @param {EscalationInput} input */
const enqueueOnce = async (io, key, input) => {
  const document = await io.read(key);
  if (!document.found) return { delivery: "ineligible", reason: "checkpoint_missing" };
  const current = StationCheckpointSchema.parse(JSON.parse(document.content));
  const reason = ineligibleReason(current, input.fingerprint);
  if (reason !== null) return { delivery: "ineligible", reason };
  if (current.blocker?.escalation !== undefined) return outboxResult(current);
  const blocker = current.blocker;
  if (blocker === undefined) return { delivery: "ineligible", reason: "blocker_changed" };
  const next = queuedCheckpoint(current, input, blocker);
  await io.write(key, JSON.stringify(next), writeOptions(document.etag));
  return outboxResult(next);
};

/** @param {EscalationIo} io @param {EscalationInput} input */
const enqueue = async (io, input) => {
  const key = checkpointKey(input.workItem, input.rootRunId, input.station);
  if (key === null) return { delivery: "ineligible", reason: "invalid_identity" };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await enqueueOnce(io, key, input);
    } catch (error) {
      lastError = error;
    }
  }
  return failedResult(lastError);
};

/** @param {EscalationIo} io @param {string} key @param {AcknowledgeInput} input */
const acknowledgeOnce = async (io, key, input) => {
  const document = await io.read(key);
  if (!document.found) return { acknowledged: false, reason: "checkpoint_missing" };
  const current = StationCheckpointSchema.parse(JSON.parse(document.content));
  if (current.blocker?.fingerprint !== input.fingerprint)
    return { acknowledged: false, reason: "blocker_changed" };
  const escalation = current.blocker?.escalation;
  if (escalation?.id !== input.escalationId)
    return { acknowledged: false, reason: "outbox_mismatch" };
  if (escalation.deliveredAt !== undefined) return { acknowledged: true, delivery: "delivered" };
  const next = deliveredCheckpoint(current, escalation);
  await io.write(key, JSON.stringify(next), writeOptions(document.etag));
  return { acknowledged: true, delivery: "delivered", revision: next.revision };
};

/** @param {EscalationIo} io @param {AcknowledgeInput} input */
const acknowledge = async (io, input) => {
  const key = checkpointKey(input.workItem, input.rootRunId, input.station);
  if (key === null) return { acknowledged: false, reason: "invalid_identity" };
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await acknowledgeOnce(io, key, input);
    } catch (error) {
      lastError = error;
    }
  }
  return { acknowledged: false, ...failedResult(lastError) };
};

/** @param {EscalationIo} io */
export const createEscalationOutbox = (io) => ({
  acknowledge: (/** @type {AcknowledgeInput} */ input) => acknowledge(io, input),
  enqueue: (/** @type {EscalationInput} */ input) => enqueue(io, input),
});

export const escalationOutbox = createEscalationOutbox({
  read: readDocument,
  write: writeDocument,
});

/** @typedef {{read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true; uploadedAt: string}>; write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>}} EscalationIo */
