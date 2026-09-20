// @ts-check
import { writePublicationComment } from "./publication-github.js";
import { publicationComment, updatePublicationRecord } from "./publication-record.js";

/** @typedef {import("./publication-record.js").PublicationRecord} PublicationRecord */
/** @typedef {{api: import("./rebase-api.js").RebaseApi, botName: string,
 * auth: import("eve/context").SessionAuthContext | null, now?: () => Date}} PublicationContext */
/** @typedef {{context: PublicationContext, id: number, record: PublicationRecord, now: string}} PublicationState */
/** @typedef {{operationId: string, status: PublicationRecord["outcome"], reason: string,
 * repairAllowed: boolean, reportActionable: boolean, targetSha: string,
 * deadlineAt: string}} PublicationResult */

/** @param {PublicationState} state @param {PublicationRecord} record */
export const savePublication = async (state, record) => {
  await writePublicationComment(state.context.api, state.id, publicationComment(record));
  return record;
};

/** @param {PublicationRecord} record
 * @param {{reason: string, repairAllowed: boolean, shouldReportActionable?: boolean}} options
 * @returns {PublicationResult}
 */
export const publicationResult = (record, options) => ({
  operationId: record.operationId,
  status: record.outcome,
  reason: options.reason,
  repairAllowed: options.repairAllowed,
  reportActionable: options.shouldReportActionable ?? false,
  targetSha: record.targetSha,
  deadlineAt: record.deadlineAt,
});

/** @param {PublicationState} state @param {string} detail @returns {Promise<PublicationResult>} */
export const failPublication = async (state, detail) => {
  const shouldReportActionable = state.record.failureReportedAt === undefined;
  const record = updatePublicationRecord(state.record, {
    outcome: "failed",
    detail,
    failureReportedAt: state.record.failureReportedAt ?? state.now,
  });
  await savePublication(state, record);
  return publicationResult(record, {
    reason: detail,
    repairAllowed: false,
    shouldReportActionable,
  });
};

/** @param {PublicationState} state @param {string} head @returns {Promise<PublicationResult>} */
export const stalePublication = async (state, head) => {
  const detail = `Remote head changed to ${head}.`;
  const record = updatePublicationRecord(state.record, { outcome: "stale", detail });
  await savePublication(state, record);
  return publicationResult(record, { reason: detail, repairAllowed: true });
};

/** @param {PublicationState} state */
export const hasPublicationExpired = (state) =>
  Date.parse(state.now) >= Date.parse(state.record.deadlineAt);
