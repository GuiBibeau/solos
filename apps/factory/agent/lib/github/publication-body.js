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
  const checkState = evidenceCheckState(state, input.check);
  if (checkState === "failed")
    return failPublication(state, "The refreshed current-head Evidence check genuinely failed.");
  if (checkState === "pending")
    return publicationResult(state.record, {
      reason: "The relevant Evidence check is pending.",
      repairAllowed: false,
    });
  if (state.record.stage === "refresh-requested")
    return publicationResult(state.record, {
      reason: "The relevant Evidence refresh is pending.",
      repairAllowed: false,
    });
  await writePublicationBody(state.context.api, state.record.pullNumber, input.body);
  const record = updatePublicationRecord(state.record, {
    stage: "refresh-requested",
    mutationAt: state.now,
  });
  await savePublication(state, record);
  return publicationResult(record, {
    reason: "Refreshed only the Evidence check without changing the body.",
    repairAllowed: false,
  });
};

/** @param {PublicationState} state @param {EvidenceCheck} check */
const evidenceCheckState = (state, check) => {
  if (hasFailedAfterMutation(state, check)) return "failed";
  return isPendingCheck(check) ? "pending" : "idle";
};

/** @param {PublicationState} state @param {EvidenceCheck} check */
const hasFailedAfterMutation = (state, check) =>
  check?.conclusion === "failure" &&
  state.record.mutationAt !== undefined &&
  Date.parse(check.completedAt) >= Date.parse(state.record.mutationAt);

/** @param {EvidenceCheck} check */
const isPendingCheck = (check) => check?.status === "queued" || check?.status === "in_progress";
