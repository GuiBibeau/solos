// @ts-check
/** @param {import("./schema.js").Proof} proof @param {string} revision */
export const hasObservedProof = (proof, revision) =>
  proof.kind !== "planned" &&
  proof.outcome === "pass" &&
  proof.revision === revision &&
  !/^(?:will\b|plan(?:ned)?\b|pending\b|to be\b|not yet\b)/i.test(proof.observation);

/** @param {import("./schema.js").Row} row @param {string} revision */
const proofFindings = (row, revision) => {
  if (row.state !== "pass") return [];
  return row.surfaces.flatMap((surface) =>
    row.proofs.some(
      (proof) =>
        hasObservedProof(proof, revision) &&
        proof.surface === surface &&
        proof.kind === row.proof_kind,
    )
      ? []
      : [`${row.id}: ${surface} needs current ${row.proof_kind} proof; planned checks do not pass`],
  );
};

/** @param {import("./schema.js").Row} row @param {import("./schema.js").Validation} input */
const rowFindings = (row, { matrix, revision }) => {
  const findings = proofFindings(row, revision);
  if (
    row.state === "pass" &&
    row.proofs.some((proof) => proof.revision === revision && proof.outcome === "fail")
  )
    findings.push(`${row.id}: pass contradicts observed failure`);
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
