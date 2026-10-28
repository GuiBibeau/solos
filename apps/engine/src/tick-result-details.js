// @ts-check

/** @param {unknown} result */
export const detailsOf = (result) => {
  if (typeof result !== "object" || result === null) return undefined;
  const row = /** @type {{ position?: unknown; amountA?: unknown; amountB?: unknown }} */ (result);
  /** @type {Record<string, unknown>} */
  const details = {};
  if (typeof row.position === "string") details.position = row.position;
  if (typeof row.amountA === "string") details.amountA = row.amountA;
  if (typeof row.amountB === "string") details.amountB = row.amountB;
  return Object.keys(details).length === 0 ? undefined : details;
};

/**
 * @template {object} T
 * @param {T} row
 * @param {unknown} result
 */
export const withDetails = (row, result) => {
  const details = detailsOf(result);
  return details === undefined ? row : { ...row, details };
};
