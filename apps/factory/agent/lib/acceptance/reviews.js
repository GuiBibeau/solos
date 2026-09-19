// @ts-check
import { draftFindings } from "./draft-review.js";
import { resolutionFindings } from "./finding-resolution.js";

/** @param {import("./schema.js").Validation} input */
const ledgerFindings = (input) => {
  const { matrix, previous } = input;
  const findings = (previous?.findings ?? []).flatMap((prior) => {
    const current = matrix.findings.find(({ id }) => id === prior.id);
    if (!current) return [`${prior.id}: earlier finding disappeared`];
    return current.detail !== prior.detail ||
      current.lane !== prior.lane ||
      JSON.stringify(current.row_ids.toSorted((a, b) => a.localeCompare(b))) !==
        JSON.stringify(prior.row_ids.toSorted((a, b) => a.localeCompare(b)))
      ? [`${prior.id}: earlier finding changed`]
      : [];
  });
  for (const finding of matrix.findings) {
    if (finding.row_ids.some((id) => matrix.rows.every((row) => row.id !== id)))
      findings.push(`${finding.id}: unknown row`);
    findings.push(...resolutionFindings(finding, input));
  }
  return findings;
};

/** @param {import("./schema.js").Validation} input */
export const unresolvedRows = ({ matrix }) =>
  matrix.rows
    .filter(({ state }) => state !== "pass" && state !== "not_applicable")
    .map((row) => `${row.id}: ${row.state}: ${row.reason}`);

/** @param {import("./schema.js").Validation} input @param {string} lane */
const laneFindings = (input, lane) => {
  const { matrix, reviews, revision } = input;
  const matches = reviews.filter((review) => review.lane === lane);
  const review = matches[0];
  if (!review || matches.length !== 1) return [`${lane}: exactly one independent review required`];
  const findings = matrix.rows
    .filter((row) => !review.reviewed_row_ids.includes(row.id))
    .map((row) => `${lane}: ${row.id} omitted from whole-matrix review`);
  if (review.revision !== revision) findings.push(`${lane}: stale review revision`);
  const hasUnresolved =
    unresolvedRows(input).length > 0 || matrix.findings.some(({ state }) => state === "open");
  if (hasUnresolved && review.verdict === "approve")
    findings.push(`${lane}: approval contradicts unresolved rows/findings`);
  return [...findings, ...draftFindings(input, review)];
};

/** @param {import("./schema.js").Validation} input */
export const validateReviews = (input) => [
  ...ledgerFindings(input),
  ...(input.phase === "review"
    ? ["spec", "standards"].flatMap((lane) => laneFindings(input, lane))
    : []),
];
