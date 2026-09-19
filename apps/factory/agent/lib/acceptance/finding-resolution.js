// @ts-check
import { proofFindings } from "./rows.js";

/** @param {import("./schema.js").Finding} finding @param {import("./schema.js").Validation} input */
export const resolutionFindings = (finding, { matrix, revision }) => {
  if (finding.state !== "resolved") return [];
  return finding.row_ids.flatMap((id) => {
    const row = matrix.rows.find((candidate) => candidate.id === id);
    if (!row || !["pass", "not_applicable"].includes(row.state))
      return [`${finding.id}: affected row ${id} is not resolved`];
    const proofs = (finding.resolution ?? []).filter((proof) =>
      row.proofs.some((observed) => JSON.stringify(observed) === JSON.stringify(proof)),
    );
    return proofFindings({ ...row, proofs }, revision).map(
      (message) => `${finding.id}: resolution ${message}`,
    );
  });
};
