// @ts-check
import { confirmEvidenceCheck, publishEvidenceBody } from "./publication-body.js";
import { readEvidenceCheck } from "./publication-check.js";
import { hasValidTargetEvidence } from "./publication-evidence.js";
import { readPublicationPull } from "./publication-github.js";
import {
  failPublication,
  hasPublicationExpired,
  publicationResult,
  savePublication,
  stalePublication,
} from "./publication-outcome.js";
import { updatePublicationRecord } from "./publication-record.js";

/** @typedef {import("./publication-outcome.js").PublicationContext} PublicationContext */
/** @typedef {import("./publication-record.js").PublicationRecord} PublicationRecord */
/** @typedef {import("./publication-outcome.js").PublicationResult} PublicationResult */

/** @param {PublicationContext} context @param {number} id @param {PublicationRecord} record
 * @returns {Promise<PublicationResult>}
 */
export const advanceEvidencePublication = async (context, id, record) => {
  const now = (context.now ?? (() => new Date()))().toISOString();
  const state = { context, id, record, now };
  const pull = await readPublicationPull(context.api, record.pullNumber);
  if (pull.head !== record.targetSha) return stalePublication(state, pull.head);
  const hasEvidence = hasValidTargetEvidence(pull.body, record.targetSha);
  if (!hasEvidence) return advanceMissingEvidence(state);
  return advancePresentEvidence(state, pull);
};

/** @param {import("./publication-outcome.js").PublicationState} state */
const advanceMissingEvidence = (state) => {
  if (hasPublicationExpired(state))
    return failPublication(
      state,
      "Matching exact-head Evidence was still missing at the publication deadline.",
    );
  if (state.record.stage === "awaiting-evidence")
    return publicationResult(state.record, {
      reason: "Waiting for the original verified Evidence; do not launch a repair.",
      repairAllowed: false,
    });
  return publishEvidenceBody(state);
};

/** @param {import("./publication-outcome.js").PublicationState} state
 * @param {Awaited<ReturnType<typeof readPublicationPull>>} pull */
const advancePresentEvidence = async (state, pull) => {
  const check = await readEvidenceCheck(state.context.api, state.record.targetSha);
  if (check?.conclusion === "success") {
    const detail = "Exact-head Evidence is present and its refreshed check passed.";
    const record = updatePublicationRecord(state.record, { outcome: "confirmed", detail });
    await savePublication(state, record);
    return publicationResult(record, { reason: detail, repairAllowed: false });
  }
  if (state.record.outcome === "failed")
    return publicationResult(state.record, {
      reason: state.record.detail ?? "Publication failed.",
      repairAllowed: false,
    });
  if (hasPublicationExpired(state))
    return failPublication(
      state,
      "The Evidence check did not confirm before the publication deadline.",
    );
  return confirmEvidenceCheck(state, { pull, check });
};
