// @ts-check

const PREFIX = "<!-- solos-factory:evidence-refresh:";
const CLOSE = " -->";

/** @param {string} body @param {string} operationId */
export const hasPublicationRefresh = (body, operationId) =>
  body.split(/\r?\n/u).includes(`${PREFIX}${operationId}${CLOSE}`);

/** Add one operation-specific body mutation outside the Evidence section.
 * @param {string} body @param {string} operationId
 */
export const withPublicationRefresh = (body, operationId) => {
  if (hasPublicationRefresh(body, operationId)) return body;
  return `${PREFIX}${operationId}${CLOSE}\n${body}`;
};
