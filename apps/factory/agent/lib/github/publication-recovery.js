// @ts-check
import { advanceEvidencePublication } from "./publication-advance.js";
import { evidenceRaw, validatePublicationEvidence } from "./publication-evidence.js";
import {
  createPublicationComment,
  readPublicationTimeline,
  readRepositoryEvents,
  remoteHeadChangedAt,
  writePublicationComment,
} from "./publication-github.js";
import {
  newPublicationRecord,
  publicationComment,
  updatePublicationRecord,
} from "./publication-record.js";

/** @typedef {import("./publication-record.js").PublicationRecord} PublicationRecord */
/** @typedef {{api: import("./rebase-api.js").RebaseApi, botName: string,
 * auth: import("eve/context").SessionAuthContext | null, now?: () => Date}} PublicationContext */
/** @typedef {{body: string, branch: string, head: string}} PublicationPull */

/** Claim an observed post-push gap so a reordered failure cannot launch another writer.
 * @param {PublicationContext} context @param {number} pullNumber @param {PublicationPull} pull
 */
export const startObservedPublication = async (context, pullNumber, pull) => {
  const now = (context.now ?? (() => new Date()))().toISOString();
  const changedAt = await publicationChangedAt(context, pullNumber, pull);
  if (!changedAt)
    return {
      status: "blocked",
      reason: "The remote head-change time is not observable yet; retry without repairing.",
      repairAllowed: false,
    };
  const raw = evidenceRaw(pull.body);
  const hasEvidence = raw !== undefined && validatePublicationEvidence(raw, pull.head).ok;
  let record = newPublicationRecord({
    pullNumber,
    targetSha: pull.head,
    expectedRemoteHead: pull.head,
    remoteResult: "observed",
    evidence: hasEvidence ? /** @type {string} */ (raw) : "",
    now,
    remoteHeadChangedAt: changedAt,
  });
  if (!hasEvidence) record = updatePublicationRecord(record, { stage: "awaiting-evidence" });
  const id = await createPublicationComment(context.api, pullNumber, publicationComment(record));
  return advanceEvidencePublication(context, id, record);
};

/** @param {PublicationContext} context @param {number} pullNumber @param {PublicationPull} pull */
export const publicationChangedAt = async (context, pullNumber, pull) => {
  const [events, timeline] = await Promise.all([
    readRepositoryEvents(context.api),
    readPublicationTimeline(context.api, pullNumber),
  ]);
  return remoteHeadChangedAt([...events, ...timeline], pull.head, pull.branch);
};

/** @param {PublicationContext} context @param {{id: number, record: PublicationRecord}} entry
 * @param {{evidence: string, remoteResult: PublicationRecord["remoteResult"], expectedRemoteHead: string}} input
 */
export const supplyPublicationEvidence = async (context, entry, input) => {
  if (entry.record.stage !== "awaiting-evidence")
    return advanceEvidencePublication(context, entry.id, entry.record);
  const record = updatePublicationRecord(entry.record, {
    evidence: input.evidence,
    expectedRemoteHead: input.expectedRemoteHead,
    remoteResult: input.remoteResult,
    stage: "created",
  });
  await writePublicationComment(context.api, entry.id, publicationComment(record));
  return advanceEvidencePublication(context, entry.id, record);
};
