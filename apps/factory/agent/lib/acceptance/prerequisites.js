// @ts-check
/** @param {import("./schema.js").Matrix["prerequisites"][number]} prerequisite */
const resolutionFindings = (prerequisite) => {
  if (prerequisite.state === "resolved") {
    return prerequisite.source &&
      prerequisite.revision &&
      prerequisite.verification !== "unverified"
      ? []
      : [`${prerequisite.id}: resolution needs a verified source and pinned revision`];
  }
  return prerequisite.maintainer_action
    ? []
    : [`${prerequisite.id}: unresolved prerequisite needs precise maintainer action`];
};

/** @param {import("./schema.js").Validation} input */
const changedDecisions = ({ matrix, previous }) =>
  (previous?.prerequisites ?? []).flatMap((prior) => {
    const current = matrix.prerequisites.find(({ id }) => id === prior.id);
    if (!current) return [`${prior.id}: prerequisite disappeared`];
    const hasChanged =
      prior.state === "resolved" &&
      ["state", "decision", "source", "revision", "verification"].some(
        (key) => Reflect.get(prior, key) !== Reflect.get(current, key),
      );
    return hasChanged && current.state !== "conflict"
      ? [`${prior.id}: merged decision changed without an explicit conflict`]
      : [];
  });

/** @param {import("./schema.js").Validation} input */
const dependentRows = ({ matrix }) =>
  matrix.rows.flatMap((row) =>
    row.prerequisite_ids.flatMap((id) => {
      const prerequisite = matrix.prerequisites.find((item) => item.id === id);
      if (!prerequisite) return [`${row.id}: unknown prerequisite ${id}`];
      return prerequisite.state !== "resolved" && row.state !== "blocked"
        ? [`${row.id}: park only this dependent work until ${id} resolves`]
        : [];
    }),
  );

/** @param {import("./schema.js").Validation} input */
export const validatePrerequisites = (input) => [
  ...input.matrix.prerequisites.flatMap(resolutionFindings),
  ...input.matrix.prerequisites.flatMap((prerequisite) =>
    prerequisite.criterion_ids
      .filter((id) => input.matrix.criteria.every((criterion) => criterion.id !== id))
      .map((id) => `${prerequisite.id}: unknown criterion ${id}`),
  ),
  ...dependentRows(input),
  ...changedDecisions(input),
  ...input.matrix.prerequisites.flatMap((prerequisite) =>
    prerequisite.criterion_ids
      .filter((id) =>
        input.matrix.rows.every(
          (row) => row.criterion_id !== id || !row.prerequisite_ids.includes(prerequisite.id),
        ),
      )
      .map((id) => `${prerequisite.id}: missing dependent row for ${id}`),
  ),
];
