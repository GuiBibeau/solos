// @ts-check
/**
 * Make a value JSON-serialisable: bigint becomes a decimal string, undefined is dropped.
 * Used at every outward boundary (MCP results, CLI output, logs).
 * @param {unknown} value
 * @returns {unknown}
 */
export const toJsonSafe = (value) =>
  JSON.parse(JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)));
