// @ts-check
import { toJsonSafe } from "./json.js";

/**
 * The wire shape of a domain error on both the MCP and CLI surfaces: `{ code, ...props }`,
 * JSON-safe, with `reason` and `remedy` sitting beside the structured props. One function so the
 * two surfaces cannot drift. Returns undefined for a value that is not a tagged domain error, so
 * callers keep their own defect shape.
 * @param {unknown} error
 * @returns {Record<string, unknown> | undefined}
 */
export const errorEnvelope = (error) => {
  if (typeof error !== "object" || error === null || !("_tag" in error)) return undefined;
  const { _tag, ...props } = /** @type {{ _tag: unknown } & Record<string, unknown>} */ (error);
  return { code: String(_tag), .../** @type {Record<string, unknown>} */ (toJsonSafe(props)) };
};
