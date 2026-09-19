// @ts-check
import { STATES } from "./schema.js";

/** @param {{id: string}[]} items */
const duplicates = (items) =>
  items.flatMap((item, index) =>
    items.findIndex(({ id }) => id === item.id) === index ? [] : [`${item.id}: duplicate ID`],
  );

/** @param {import("./schema.js").Row} row */
const rowContract = (row) => [
  row.id,
  row.criterion_id,
  row.requirement,
  row.dimension,
  row.validator,
  row.responsibility,
  row.proof_kind,
  row.surfaces.toSorted((a, b) => a.localeCompare(b)),
  row.prerequisite_ids.toSorted((a, b) => a.localeCompare(b)),
];

/** @param {import("./schema.js").Validation} input */
const rowChanges = ({ matrix, previous }) => {
  const priorRows = previous?.rows ?? [];
  return priorRows.flatMap((row) => {
    const next = matrix.rows.find(({ id }) => id === row.id);
    return !next || JSON.stringify(rowContract(row)) !== JSON.stringify(rowContract(next))
      ? [`${row.id}: contract row missing or changed; preserve earlier boundaries`]
      : [];
  });
};

/** @param {import("./schema.js").Matrix} matrix */
const surfaceFindings = (matrix) =>
  matrix.criteria.flatMap((criterion) => {
    const rows = matrix.rows.filter((row) => row.criterion_id === criterion.id);
    if (rows.length === 0) return [`${criterion.id}: no validation row`];
    return criterion.required_surfaces
      .filter((surface) => rows.every((row) => !row.surfaces.includes(surface)))
      .map((surface) => `${criterion.id}: required surface ${surface} missing`);
  });

/** @param {import("./schema.js").Validation} input */
export const validateContract = (input) => {
  const { originals, matrix } = input;
  const findings = originals.flatMap((original) => {
    const criterion = matrix.criteria.find(({ id }) => id === original.id);
    return JSON.stringify(criterion) === JSON.stringify(original)
      ? []
      : [`${original.id}: original criterion missing or changed`];
  });
  for (const state of STATES) {
    if (matrix.summary[state] !== matrix.rows.filter((row) => row.state === state).length)
      findings.push(`summary.${state}: contradicts rows`);
  }
  return [
    ...findings,
    ...matrix.criteria
      .filter((criterion) => originals.every(({ id }) => id !== criterion.id))
      .map(({ id }) => `${id}: criterion is not in originals; expand boundary rows instead`),
    ...rowChanges(input),
    ...surfaceFindings(matrix),
    ...[originals, matrix.criteria, matrix.rows, matrix.prerequisites, matrix.findings].flatMap(
      duplicates,
    ),
  ];
};
