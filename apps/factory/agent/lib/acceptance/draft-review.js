// @ts-check
/** @param {import("./schema.js").Row} row */
const canDefer = (row) =>
  row.state === "pending" && ["operator", "ci"].includes(row.responsibility);

/** @param {import("./schema.js").Validation["reviews"][number]} review */
const nonDraftFindings = (review) =>
  review.deferred_row_ids.length === 0
    ? []
    : [`${review.lane}: only draft approval may defer rows`];

/** @param {import("./schema.js").Validation} input @param {import("./schema.js").Validation["reviews"][number]} review */
export const draftFindings = ({ matrix }, review) => {
  if (review.verdict !== "approve_draft") return nonDraftFindings(review);
  const pending = matrix.rows.filter((row) => !["pass", "not_applicable"].includes(row.state));
  const findings = pending
    .filter((row) => !canDefer(row))
    .map((row) => `${review.lane}: ${row.id} cannot be deferred to draft QA`);
  const deferred = new Set(review.deferred_row_ids);
  if (deferred.size !== review.deferred_row_ids.length)
    findings.push(`${review.lane}: duplicate deferred row`);
  for (const row of pending) {
    if (!deferred.has(row.id))
      findings.push(`${review.lane}: pending ${row.id} missing explicit deferral`);
  }
  for (const id of deferred) {
    if (pending.every((row) => row.id !== id))
      findings.push(`${review.lane}: ${id} is not pending QA`);
  }
  if (matrix.findings.some(({ state }) => state === "open"))
    findings.push(`${review.lane}: open findings prevent draft approval`);
  return findings;
};
