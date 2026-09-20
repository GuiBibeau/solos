// @ts-check

const PREFIX = "<!-- solos-factory:evidence-refresh:";
const CLOSE = " -->";

/** @param {string} body @param {string} operationId */
export const publicationRefreshAt = (body, operationId) => {
  const prefix = `${PREFIX}${operationId}:`;
  const line = body.split(/\r?\n/u).find((item) => item.startsWith(prefix) && item.endsWith(CLOSE));
  if (!line) return undefined;
  const value = line.slice(prefix.length, -CLOSE.length);
  return Number.isFinite(Date.parse(value)) ? value : undefined;
};

/** Add one operation-specific body mutation outside the Evidence section.
 * @param {string} body @param {string} operationId @param {string} mutationAt
 */
export const withPublicationRefresh = (body, operationId, mutationAt) => {
  if (publicationRefreshAt(body, operationId)) return body;
  return `${PREFIX}${operationId}:${mutationAt}${CLOSE}\n${body}`;
};
