// @ts-check
/** Pure artifact fixtures; these observations replay reports, never claim to run product QA. */
export const REVISION = "d7a6640b02ab899fd965cdceb5099254c9b75f79";
export const ORIGINAL = {
  id: "47-ac-1",
  text: "Zero and sub-lamport-to-zero cases fail for both simulate and execute; one lamport and ordinary positive exact amounts still work.",
  source: "https://github.com/GuiBibeau/solos/issues/47",
  required_surfaces: ["cli.simulate", "cli.send"],
};

/** @param {string} surface @returns {import("./schema.js").Proof} */
export const proof = (surface) => ({
  kind: "behavioral",
  revision: REVISION,
  surface,
  reference: "bun run solos dev test --filter transfer",
  observation: "ValidationError returned with an unusable signer; signer was not acquired.",
  outcome: "pass",
});

/** @returns {import("./schema.js").Validation} */
export const replay = () => ({
  originals: [ORIGINAL],
  matrix: {
    criteria: [ORIGINAL],
    rows: [
      {
        id: "47-ac-1.ordering",
        criterion_id: ORIGINAL.id,
        requirement: "Reject invalid amounts before signer acquisition.",
        dimension: "failure_timing",
        surfaces: ["cli.simulate", "cli.send"],
        validator: "native_cli",
        responsibility: "spec",
        proof_kind: "behavioral",
        prerequisite_ids: [],
        state: "pass",
        reason: null,
        proofs: [proof("cli.simulate"), proof("cli.send")],
      },
    ],
    prerequisites: [],
    findings: [],
    summary: { pass: 1, fail: 0, pending: 0, blocked: 0, not_applicable: 0 },
  },
  previous: null,
  revision: REVISION,
  reviews: [],
  phase: "analysis",
});

/** @param {import("./schema.js").Validation} input */
export const firstRow = (input) => {
  const row = input.matrix.rows[0];
  if (!row) throw new Error("Replay needs a row");
  return row;
};
