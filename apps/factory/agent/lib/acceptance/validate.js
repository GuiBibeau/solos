// @ts-check
import { validateContract } from "./contract.js";
import { validatePrerequisites } from "./prerequisites.js";
import { unresolvedRows, validateReviews } from "./reviews.js";
import { validateRows } from "./rows.js";
import { ValidationSchema } from "./schema.js";

/** Validate the source contract before accepting a station handoff. @param {unknown} input */
export const validateAcceptance = (input) => {
  const parsed = ValidationSchema.safeParse(input);
  if (!parsed.success)
    return {
      valid: false,
      ready: false,
      draft_deliverable: false,
      parked_row_ids: [],
      unresolved: [],
      findings: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  const findings = [
    ...validateContract(parsed.data),
    ...validateRows(parsed.data),
    ...validatePrerequisites(parsed.data),
    ...validateReviews(parsed.data),
  ];
  const unresolved = [
    ...unresolvedRows(parsed.data),
    ...parsed.data.matrix.findings
      .filter(({ state }) => state === "open")
      .map(({ id, detail }) => `${id}: ${detail}`),
  ];
  const parked_row_ids = parsed.data.matrix.rows
    .filter((row) => row.state === "blocked")
    .map(({ id }) => id);
  const isValid = findings.length === 0;
  const ready =
    isValid &&
    parsed.data.phase === "review" &&
    unresolved.length === 0 &&
    parsed.data.reviews.every(({ verdict }) => verdict === "approve");
  const draft_deliverable =
    isValid &&
    parsed.data.phase === "review" &&
    parsed.data.reviews.every(({ verdict }) => ["approve", "approve_draft"].includes(verdict));
  return { valid: isValid, ready, draft_deliverable, parked_row_ids, unresolved, findings };
};
