// @ts-check
import { asRecord, stringField } from "./channel-gates.js";

const OPEN = "<!-- solos-factory:evidence-publication:v1\n";
const CLOSE = "\n-->";
const SHA = /^[a-f\d]{40}$/u;
export const PUBLICATION_WINDOW_MS = 10 * 60 * 1000;

/** @typedef {"active" | "confirmed" | "failed" | "stale"} PublicationOutcome */
/** @typedef {"created" | "write-planned" | "body-written" | "refresh-requested"} PublicationStage */
/** @typedef {object} PublicationRecord
 * @property {number} version
 * @property {string} operationId
 * @property {number} pullNumber
 * @property {string} targetSha
 * @property {string} expectedRemoteHead
 * @property {"pushed" | "rebased" | "already-remote"} remoteResult
 * @property {string} startedAt
 * @property {string} remoteHeadChangedAt
 * @property {string} deadlineAt
 * @property {PublicationOutcome} outcome
 * @property {PublicationStage} stage
 * @property {string} evidence
 * @property {string=} plannedBodyHash
 * @property {string=} mutationAt
 * @property {string=} detail
 * @property {string=} failureReportedAt
 */

/** @param {PublicationRecord} value */
export const publicationComment = (value) =>
  `${OPEN}${Buffer.from(JSON.stringify(value)).toString("base64")}${CLOSE}\n` +
  `Evidence publication \`${value.operationId}\`: **${value.outcome}** for \`${value.targetSha.slice(0, 12)}\`. Deadline: ${value.deadlineAt}.`;

/** @param {string} body @returns {PublicationRecord | null} */
export const parsePublicationComment = (body) => {
  const start = body.indexOf(OPEN);
  const end = start === -1 ? -1 : body.indexOf(CLOSE, start + OPEN.length);
  if (start === -1 || end === -1) return null;
  try {
    const value = asRecord(
      JSON.parse(Buffer.from(body.slice(start + OPEN.length, end), "base64").toString("utf8")),
    );
    return isPublicationRecord(value) ? /** @type {PublicationRecord} */ (value) : null;
  } catch {
    return null;
  }
};

/** @param {Record<string, unknown> | null} value */
const isPublicationRecord = (value) =>
  hasPublicationIdentity(value) &&
  hasPublicationState(/** @type {Record<string, unknown>} */ (value));

/** @param {Record<string, unknown> | null} value */
const hasPublicationIdentity = (value) =>
  value !== null &&
  value.version === 1 &&
  typeof value.operationId === "string" &&
  typeof value.pullNumber === "number" &&
  hasPublicationTarget(value);

/** @param {Record<string, unknown>} value */
const hasPublicationTarget = (value) =>
  SHA.test(stringField(value, "targetSha") ?? "") &&
  SHA.test(stringField(value, "expectedRemoteHead") ?? "") &&
  typeof value.evidence === "string";

/** @param {Record<string, unknown>} value */
const hasPublicationState = (value) => {
  const hasOutcome = ["active", "confirmed", "failed", "stale"].includes(String(value.outcome));
  const hasStage = ["created", "write-planned", "body-written", "refresh-requested"].includes(
    String(value.stage),
  );
  return hasOutcome && hasStage;
};

/** Only comments authored by this GitHub App are operation records.
 * @param {unknown[]} comments @param {string} botName
 */
export const publicationEntries = (comments, botName) =>
  comments.flatMap((entry) => publicationEntry(entry, botName));

/** @param {unknown} entry @param {string} botName */
const publicationEntry = (entry, botName) => {
  const item = asRecord(entry);
  const user = asRecord(item?.user);
  if (!isBotAuthor(user, botName)) return [];
  const record = parsePublicationComment(stringField(item, "body") ?? "");
  const id = typeof item?.id === "number" ? item.id : null;
  return id && record ? [{ id, record }] : [];
};

/** @param {Record<string, unknown> | null} user @param {string} botName */
const isBotAuthor = (user, botName) => user?.login === `${botName}[bot]` && user.type === "Bot";

/** @param {PublicationRecord} record @param {Partial<PublicationRecord>} patch */
export const updatePublicationRecord = (record, patch) => ({ ...record, ...patch });

/** @param {{pullNumber: number, targetSha: string, expectedRemoteHead: string,
 * remoteResult: PublicationRecord["remoteResult"], evidence: string,
 * now: string, remoteHeadChangedAt: string}} input
 * @returns {PublicationRecord}
 */
export const newPublicationRecord = (input) => ({
  version: 1,
  operationId: `evidence:${input.pullNumber}:${input.targetSha}`,
  pullNumber: input.pullNumber,
  targetSha: input.targetSha,
  expectedRemoteHead: input.expectedRemoteHead,
  remoteResult: input.remoteResult,
  evidence: input.evidence,
  startedAt: input.now,
  remoteHeadChangedAt: input.remoteHeadChangedAt,
  deadlineAt: new Date(Date.parse(input.remoteHeadChangedAt) + PUBLICATION_WINDOW_MS).toISOString(),
  outcome: /** @type {const} */ ("active"),
  stage: /** @type {const} */ ("created"),
});
