// @ts-check
import { proof, REVISION } from "./replay-fixture.js";

/** @typedef {import("./schema.js").Row} Row */
/** @typedef {{criterion: number, id: string, requirement: string, surfaces: string[], validator?: Row["validator"], dimension?: Row["dimension"], responsibility?: Row["responsibility"]}} Boundary */

/** @param {Boundary} boundary @param {number} number @returns {Row} */
const buildRow = (boundary, number) => {
  const kind = boundary.validator === "review" ? "inspection" : "behavioral";
  return {
    id: `${number}-ac-${boundary.criterion}.${boundary.id}`,
    criterion_id: `${number}-ac-${boundary.criterion}`,
    requirement: boundary.requirement,
    dimension: boundary.dimension ?? "domain",
    surfaces: boundary.surfaces,
    validator: boundary.validator ?? "pure",
    responsibility: boundary.responsibility ?? "spec",
    proof_kind: kind,
    prerequisite_ids: [],
    state: "pass",
    reason: null,
    proofs: boundary.surfaces.map((surface) => ({
      ...proof(surface),
      kind,
      observation: `Reported replay observation: ${boundary.requirement}`,
    })),
  };
};

/** Reported observations in replay fixtures are data, not evidence that this test ran product QA.
 * @param {{number: number, criteria: string[], boundaries: Boundary[]}} contract
 * @returns {import("./schema.js").Validation}
 */
export const replayContract = ({ number, criteria, boundaries }) => {
  const originals = criteria.map((text, index) => ({
    id: `${number}-ac-${index + 1}`,
    text,
    source: `https://github.com/GuiBibeau/solos/issues/${number}`,
    required_surfaces: [
      ...new Set(
        boundaries.filter((row) => row.criterion === index + 1).flatMap((row) => row.surfaces),
      ),
    ],
  }));
  const rows = boundaries.map((boundary) => buildRow(boundary, number));
  return {
    originals,
    revision: REVISION,
    phase: "analysis",
    previous: null,
    reviews: [],
    matrix: {
      criteria: structuredClone(originals),
      rows,
      prerequisites: [],
      findings: [],
      summary: { pass: rows.length, fail: 0, pending: 0, blocked: 0, not_applicable: 0 },
    },
  };
};

/** @param {import("./schema.js").Validation} input @param {string} suffix */
export const replayRow = (input, suffix) => {
  const row = input.matrix.rows.find(({ id }) => id.endsWith(`.${suffix}`));
  if (!row) throw new Error(`Missing replay row ${suffix}`);
  return row;
};
