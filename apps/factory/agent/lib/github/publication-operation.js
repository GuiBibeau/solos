// @ts-check
import { intakeIssueNumber, isAutonomous, isTrusted } from "../trust.js";
import { advanceEvidencePublication } from "./publication-advance.js";
import { validatePublicationEvidence } from "./publication-evidence.js";
import {
  createPublicationComment,
  readPublicationComments,
  readPublicationPull,
  writePublicationComment,
} from "./publication-github.js";
import {
  newPublicationRecord,
  publicationComment,
  publicationEntries,
  updatePublicationRecord,
} from "./publication-record.js";
import {
  publicationChangedAt,
  startObservedPublication,
  supplyPublicationEvidence,
} from "./publication-recovery.js";

/** @typedef {import("./rebase-api.js").RebaseApi} Api */
/** @typedef {import("./publication-record.js").PublicationRecord} PublicationRecord */
/** @typedef {{api: Api, botName: string, auth: import("eve/context").SessionAuthContext | null,
 * now?: () => Date}} PublicationContext */

/** @param {import("eve/context").SessionAuthContext | null} auth @param {number} pullNumber */
export const isPublicationAuthorized = (auth, pullNumber) =>
  isAutonomous(auth) ? intakeIssueNumber(auth) === pullNumber : isTrusted(auth);

/** @param {{pullNumber: number}} input @param {PublicationContext} context */
export const reconcileEvidencePublication = async (input, context) => {
  if (!isPublicationAuthorized(context.auth, input.pullNumber))
    return {
      status: "blocked",
      reason: "Evidence publication requires this PR's scope.",
      repairAllowed: false,
    };
  const comments = await readPublicationComments(context.api, input.pullNumber);
  const entries = publicationEntries(comments, context.botName);
  const current = await readPublicationPull(context.api, input.pullNumber);
  const entry = entries.findLast(({ record }) => record.targetSha === current.head);
  if (!entry) return startObservedPublication(context, input.pullNumber, current);
  return advanceEvidencePublication(context, entry.id, entry.record);
};

/** @param {{pullNumber: number, targetSha: string, expectedRemoteHead: string,
 * remoteResult: PublicationRecord["remoteResult"], evidence: string}} input
 * @param {PublicationContext} context
 */
export const publishRevisionEvidence = async (input, context) => {
  const error = publicationInputError(input, context);
  if (error) return error;
  const current = await readPublicationPull(context.api, input.pullNumber);
  if (current.head !== input.expectedRemoteHead)
    return {
      status: "stale",
      reason: `Remote head changed to ${current.head}.`,
      repairAllowed: true,
    };
  const comments = await readPublicationComments(context.api, input.pullNumber);
  const entries = publicationEntries(comments, context.botName);
  await retireSupersededPublications(context, entries, input.targetSha);
  const existing = entries.findLast(({ record }) => record.targetSha === input.targetSha);
  if (existing) return supplyPublicationEvidence(context, existing, input);
  const now = (context.now ?? (() => new Date()))().toISOString();
  const changedAt = await publicationChangedAt(context, input.pullNumber, current);
  if (!changedAt)
    return {
      status: "blocked",
      reason:
        "The remote head-change time is not observable yet; retry publication without repairing.",
      repairAllowed: false,
    };
  const record = newPublicationRecord({
    ...input,
    now,
    remoteHeadChangedAt: changedAt,
  });
  const id = await createPublicationComment(
    context.api,
    input.pullNumber,
    publicationComment(record),
  );
  return advanceEvidencePublication(context, id, record);
};

/** @param {Parameters<typeof publishRevisionEvidence>[0]} input @param {PublicationContext} context */
const publicationInputError = (input, context) => {
  if (!isPublicationAuthorized(context.auth, input.pullNumber))
    return {
      status: "blocked",
      reason: "Evidence publication requires this PR's scope.",
      repairAllowed: false,
    };
  if (input.targetSha !== input.expectedRemoteHead)
    return {
      status: "blocked",
      reason: "Target sha must equal the confirmed remote head.",
      repairAllowed: false,
    };
  const evidence = validatePublicationEvidence(input.evidence, input.targetSha);
  return evidence.ok ? null : { status: "blocked", reason: evidence.reason, repairAllowed: false };
};

/** @param {PublicationContext} context
 * @param {ReturnType<typeof publicationEntries>} entries @param {string} targetSha
 */
const retireSupersededPublications = async (context, entries, targetSha) => {
  for (const entry of entries) {
    if (entry.record.outcome !== "active" || entry.record.targetSha === targetSha) continue;
    const record = updatePublicationRecord(entry.record, {
      outcome: "stale",
      detail: `Superseded by remote head ${targetSha}.`,
    });
    await writePublicationComment(context.api, entry.id, publicationComment(record));
  }
};
