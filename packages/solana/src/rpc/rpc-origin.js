// @ts-check
/**
 * Errors and startup logs leave the process, and provider credentials can sit in an RPC URL's
 * path or query — so everything that leaves an adapter carries the endpoint origin only,
 * never the configured URL itself.
 * @param {string | undefined} url
 * @returns {string}
 */
export const rpcOrigin = (url) => {
  try {
    return new URL(/** @type {string} */ (url)).origin;
  } catch {
    return "<unparseable rpc url>";
  }
};
