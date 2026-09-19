// @ts-check
import { createHash } from "node:crypto";

/** @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint */
/** @typedef {{fingerprint: string; rootRunId: string; station: string; workItem: string}} EscalationInput */

/** @param {EscalationInput} input */
const escalationId = (input) => {
  const material = `${input.workItem}\0${input.rootRunId}\0${input.station}\0${input.fingerprint}`;
  return `esc_${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
};

/** @param {StationCheckpoint} checkpoint @param {EscalationInput} input @param {NonNullable<StationCheckpoint["blocker"]>} blocker */
export const queuedCheckpoint = (checkpoint, input, blocker) => {
  const queuedAt = new Date().toISOString();
  const id = escalationId(input);
  const message =
    `Station ${checkpoint.station} remains blocked after ${blocker.attempts} attempts. ` +
    `Last operation: ${checkpoint.latestOperation.name} (${checkpoint.latestOperation.status}). ` +
    `Attempted correction: ${blocker.attemptedCorrection}`;
  const escalation = { deliveryKey: `solos-station-escalation:${id}`, id, message, queuedAt };
  return {
    ...checkpoint,
    blocker: { ...blocker, escalation },
    revision: checkpoint.revision + 1,
    updatedAt: queuedAt,
  };
};

/** @param {StationCheckpoint} checkpoint */
export const outboxResult = (checkpoint) => {
  const escalation = checkpoint.blocker?.escalation;
  if (escalation === undefined) return { delivery: "ineligible", reason: "outbox_missing" };
  return {
    delivery: escalation.deliveredAt === undefined ? "pending" : "delivered",
    deliveryKey: escalation.deliveryKey,
    escalation: escalation.message,
    escalationId: escalation.id,
    revision: checkpoint.revision,
  };
};

/** @param {StationCheckpoint} checkpoint @param {string} fingerprint */
export const ineligibleReason = (checkpoint, fingerprint) => {
  if (checkpoint.blocker?.fingerprint !== fingerprint) return "blocker_changed";
  if (checkpoint.blocker.attempts < 2) return "correction_pending";
  return null;
};

/** @param {StationCheckpoint} checkpoint @param {NonNullable<NonNullable<StationCheckpoint["blocker"]>["escalation"]>} escalation */
export const deliveredCheckpoint = (checkpoint, escalation) => {
  const deliveredAt = new Date().toISOString();
  return {
    ...checkpoint,
    blocker: { ...checkpoint.blocker, escalation: { ...escalation, deliveredAt } },
    revision: checkpoint.revision + 1,
    updatedAt: deliveredAt,
  };
};
