// @ts-check
import { hasValidTargetEvidence, publicationHash, withEvidence } from "./publication-evidence.js";
import {
  readEvidenceCheck,
  readPublicationPull,
  writePublicationBody,
} from "./publication-github.js";
import {
  failPublication,
  publicationResult,
  savePublication,
  stalePublication,
} from "./publication-outcome.js";
import { updatePublicationRecord } from "./publication-record.js";
import { publicationRefreshAt, withPublicationRefresh } from "./publication-refresh.js";

/** @typedef {import("./publication-outcome.js").PublicationState} PublicationState */
/** @typedef {import("./publication-outcome.js").PublicationResult} PublicationResult */
/** @typedef {Awaited<ReturnType<typeof readEvidenceCheck>>} EvidenceCheck */

/** @param {PublicationState} state @returns {Promise<PublicationResult>} */
export const publishEvidenceBody = async (state) => {
  let pull = await readPublicationPull(state.context.api, state.record.pullNumber);
  if (pull.head !== state.record.targetSha) return stalePublication(state, pull.head);
  if (hasValidTargetEvidence(pull.body, state.record.targetSha))
    return confirmEvidenceCheck(state, {
      body: pull.body,
      check: await readEvidenceCheck(state.context.api, state.record.targetSha),
    });
  let body = withEvidence(pull.body, state.record.evidence);
  let record = updatePublicationRecord(state.record, {
    stage: "write-planned",
    plannedBodyHash: publicationHash(body),
  });
  await savePublication(state, record);
  pull = await readPublicationPull(state.context.api, state.record.pullNumber);
  if (pull.head !== state.record.targetSha)
    return stalePublication({ ...state, record }, pull.head);
  body = withEvidence(pull.body, state.record.evidence);
  if (publicationHash(body) !== record.plannedBodyHash) {
    record = updatePublicationRecord(record, { plannedBodyHash: publicationHash(body) });
    await savePublication(state, record);
  }
  await writePublicationBody(state.context.api, state.record.pullNumber, body);
  const written = await readPublicationPull(state.context.api, state.record.pullNumber);
  if (written.head !== state.record.targetSha)
    return stalePublication({ ...state, record }, written.head);
  if (!hasValidTargetEvidence(written.body, state.record.targetSha))
    return failPublication(
      { ...state, record },
      "GitHub did not retain the exact Evidence body write.",
    );
  const active = updatePublicationRecord(record, { stage: "body-written", mutationAt: state.now });
  await savePublication(state, active);
  return publicationResult(active, {
    reason: "Exact-head Evidence was published; check confirmation is pending.",
    repairAllowed: false,
  });
};

/** @param {PublicationState} state @param {{body: string, check: EvidenceCheck}} input
 * @returns {Promise<PublicationResult>}
 */
export const confirmEvidenceCheck = async (state, input) => {
  const active = await recoverRefreshMarker(state, input.body);
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
  const body = withPublicationRefresh(input.body, active.record.operationId, active.now);
  await writePublicationBody(active.context.api, active.record.pullNumber, body);
  const written = await readPublicationPull(active.context.api, active.record.pullNumber);
  if (written.head !== active.record.targetSha) return stalePublication(active, written.head);
  if (publicationRefreshAt(written.body, active.record.operationId) !== active.now)
    return failPublication(active, "GitHub did not retain the Evidence refresh marker.");
  const record = updatePublicationRecord(active.record, {
    stage: "refresh-requested",
    mutationAt: active.now,
  });
  await savePublication(active, record);
  return publicationResult(record, {
    reason: "Requested one durable Evidence check refresh marker.",
    repairAllowed: false,
  });
};

/** @param {PublicationState} state @param {string} body */
const recoverRefreshMarker = async (state, body) => {
  const mutationAt = publicationRefreshAt(body, state.record.operationId);
  if (!mutationAt || state.record.mutationAt === mutationAt) return state;
  const record = updatePublicationRecord(state.record, { stage: "refresh-requested", mutationAt });
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
