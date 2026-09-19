// @ts-check
/** @param {import("./schema.js").Proof} proof @param {string} revision */
export const hasObservedProof = (proof, revision) =>
  proof.kind !== "planned" &&
  proof.outcome === "pass" &&
  proof.revision === revision &&
  !/^(?:will\b|plan(?:ned)?\b|pending\b|to be\b|not yet\b)/i.test(proof.observation);

/** @param {import("./schema.js").Row} row @param {string} revision */
export const proofFindings = (row, revision) => {
  if (!["pass", "not_applicable"].includes(row.state)) return [];
  const kind = row.state === "not_applicable" ? "inspection" : row.proof_kind;
  return row.surfaces.flatMap((surface) =>
    row.proofs.some(
      (proof) =>
        hasObservedProof(proof, revision) &&
        proof.surface === surface &&
        proof.kind === kind &&
        (row.state !== "not_applicable" || proof.source !== null),
    )
      ? []
      : [
          `${row.id}: ${surface} needs current ${kind} proof; exemptions also need a source URL and quote`,
        ],
  );
};

/** @param {import("./schema.js").Row} row @param {string} revision */
const validationMethodFindings = (row, revision) => {
  const findings = proofFindings(row, revision);
  const requiresBehavior =
    row.validator !== "review" || ["failure_timing", "observability"].includes(row.dimension);
  if (requiresBehavior && row.proof_kind !== "behavioral")
    findings.push(`${row.id}: runtime validation requires behavioral proof, not source inspection`);
  if (
    row.state === "pass" &&
    row.proofs.some((proof) => proof.revision === revision && proof.outcome === "fail")
  )
    findings.push(`${row.id}: pass contradicts observed failure`);
  return findings;
};

/** @param {import("./schema.js").Row} row @param {import("./schema.js").Validation} input */
const rowFindings = (row, { matrix, revision }) => {
  const findings = validationMethodFindings(row, revision);
  if (matrix.criteria.every(({ id }) => id !== row.criterion_id))
    findings.push(`${row.id}: unknown criterion`);
  if (row.state !== "pass" && !row.reason)
    findings.push(`${row.id}: ${row.state} requires a reason`);
  if (new Set(row.surfaces).size !== row.surfaces.length)
    findings.push(`${row.id}: duplicate surface`);
  return findings;
};

/** @param {import("./schema.js").Validation} input */
export const validateRows = (input) => input.matrix.rows.flatMap((row) => rowFindings(row, input));
