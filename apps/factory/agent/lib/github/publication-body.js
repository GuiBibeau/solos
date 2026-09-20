// @ts-check
import { readEvidenceCheck } from "./publication-check.js";
import { hasValidTargetEvidence, publicationHash, withEvidence } from "./publication-evidence.js";
import { readPublicationPull } from "./publication-github.js";
import {
  failPublication,
  publicationResult,
  savePublication,
  stalePublication,
} from "./publication-outcome.js";
import { updatePublicationRecord } from "./publication-record.js";
import { hasPublicationRefresh, withPublicationRefresh } from "./publication-refresh.js";
import { writePublicationMutation } from "./publication-write.js";

/** @typedef {import("./publication-outcome.js").PublicationState} PublicationState */
/** @typedef {import("./publication-outcome.js").PublicationResult} PublicationResult */
/** @typedef {Awaited<ReturnType<typeof readEvidenceCheck>>} EvidenceCheck */

/** @param {PublicationState} state @returns {Promise<PublicationResult>} */
export const publishEvidenceBody = async (state) => {
  let pull = await readPublicationPull(state.context.api, state.record.pullNumber);
  if (pull.head !== state.record.targetSha) return stalePublication(state, pull.head);
  if (hasValidTargetEvidence(pull.body, state.record.targetSha))
    return confirmEvidenceCheck(state, {
      pull,
      check: await readEvidenceCheck(state.context.api, state.record.targetSha),
    });
  const body = withEvidence(pull.body, state.record.evidence);
  const record = updatePublicationRecord(state.record, {
    stage: "write-planned",
    plannedBodyHash: publicationHash(body),
  });
  await savePublication(state, record);
  pull = await readPublicationPull(state.context.api, state.record.pullNumber);
  const written = await writePublicationMutation({
    api: state.context.api,
    pullNumber: state.record.pullNumber,
    targetSha: state.record.targetSha,
    initial: pull,
    mutate: (latest) => withEvidence(latest, state.record.evidence),
    accepts: (latest) => hasValidTargetEvidence(latest, state.record.targetSha),
  });
  if (written.status === "stale") return stalePublication({ ...state, record }, written.pull.head);
  if (written.status !== "written")
    return failPublication({ ...state, record }, "Evidence body changed repeatedly during write.");
  const active = updatePublicationRecord(record, {
    stage: "body-written",
    mutationAt: written.mutationAt,
    plannedBodyHash: publicationHash(written.pull.body),
  });
  await savePublication(state, active);
  return publicationResult(active, {
    reason: "Exact-head Evidence was published; check confirmation is pending.",
    repairAllowed: false,
  });
};

/** @param {PublicationState} state
 * @param {{pull: Awaited<ReturnType<typeof readPublicationPull>>, check: EvidenceCheck}} input
 * @returns {Promise<PublicationResult>}
 */
export const confirmEvidenceCheck = async (state, input) => {
  const active = await recoverBodyMutation(state, input.pull);
  const checkState = evidenceCheckState(active, input.check);
  if (checkState === "failed")
    return failPublication(active, "The refreshed current-head Evidence check genuinely failed.");
  if (checkState === "pending")
    return publicationResult(active.record, {
      reason: "The relevant Evidence check is pending.",
      repairAllowed: false,
    });
  if (active.record.stage === "refresh-requested")
    return publicationResult(active.record, {
      reason: "The relevant Evidence refresh is pending.",
      repairAllowed: false,
    });
  const written = await writePublicationMutation({
    api: active.context.api,
    pullNumber: active.record.pullNumber,
    targetSha: active.record.targetSha,
    initial: input.pull,
    mutate: (latest) => withPublicationRefresh(latest, active.record.operationId),
    accepts: (latest) => hasPublicationRefresh(latest, active.record.operationId),
  });
  if (written.status === "stale") return stalePublication(active, written.pull.head);
  if (written.status !== "written")
    return failPublication(active, "Evidence refresh conflicted with repeated PR body edits.");
  const record = updatePublicationRecord(active.record, {
    stage: "refresh-requested",
    mutationAt: written.mutationAt,
  });
  await savePublication(active, record);
  return publicationResult(record, {
    reason: "Requested one durable Evidence check refresh marker.",
    repairAllowed: false,
  });
};

/** @param {PublicationState} state @param {Awaited<ReturnType<typeof readPublicationPull>>} pull */
const recoverBodyMutation = async (state, pull) => {
  const marker = hasPublicationRefresh(pull.body, state.record.operationId);
  const isEvidenceWrite = state.record.stage === "write-planned";
  if (!marker && !isEvidenceWrite) return state;
  if (state.record.mutationAt === pull.updatedAt) return state;
  const stage = marker ? "refresh-requested" : "body-written";
  const record = updatePublicationRecord(state.record, { stage, mutationAt: pull.updatedAt });
  await savePublication(state, record);
  return { ...state, record };
};

/** @param {PublicationState} state @param {EvidenceCheck} check */
const evidenceCheckState = (state, check) => {
  if (hasFailedAfterMutation(state, check)) return "failed";
  return isPendingCheck(check) ? "pending" : "idle";
};

/** @param {PublicationState} state @param {EvidenceCheck} check */
const hasFailedAfterMutation = (state, check) => {
  const startedAt = timestamp(check?.startedAt);
  const mutationAt = timestamp(state.record.mutationAt);
  return (
    check?.conclusion === "failure" &&
    startedAt !== undefined &&
    mutationAt !== undefined &&
    startedAt >= mutationAt
  );
};

/** @param {unknown} value */
const timestamp = (value) => {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** @param {EvidenceCheck} check */
const isPendingCheck = (check) => check?.status === "queued" || check?.status === "in_progress";
