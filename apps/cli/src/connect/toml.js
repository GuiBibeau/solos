// @ts-check
/**
 * Codex keeps MCP servers in TOML. There is no TOML writer in the toolchain, so the solos table
 * is rendered by hand and placed with text surgery: replace the existing `[mcp_servers.solos]`
 * block when there is one, append otherwise. `Bun.TOML.parse` then proves the result still parses.
 */

const HEADER = "[mcp_servers.solos]";

/**
 * TOML basic strings share JSON's escapes for everything a path or flag can contain.
 * @param {string} value
 */
const str = (value) => JSON.stringify(value);

/**
 * @param {import("./entry.js").McpEntry} entry
 */
export const renderCodexTable = (entry) => {
  const lines = [
    HEADER,
    `command = ${str(entry.command)}`,
    `args = [${entry.args.map(str).join(", ")}]`,
  ];
  const env = Object.entries(entry.env);
  if (env.length > 0) {
    lines.push(`env = { ${env.map(([key, value]) => `${key} = ${str(value)}`).join(", ")} }`);
  }
  return `${lines.join("\n")}\n`;
};

/**
 * The line range of the solos table: from its header to the line before the next table header,
 * or to the end of the file.
 * @param {string[]} lines
 */
const solosBlock = (lines) => {
  const start = lines.findIndex((line) => line.trim() === HEADER);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(/** @type {string} */ (lines[end]))) end += 1;
  return { start, end };
};

/**
 * @param {string | null} existing the current file text, or null when there is no file
 * @param {import("./entry.js").McpEntry} entry
 */
export const mergeCodexConfig = (existing, entry) => {
  const table = renderCodexTable(entry);
  if (existing === null || existing.trim() === "") return finish(table);
  const lines = existing.split("\n");
  const block = solosBlock(lines);
  if (block === null) return finish(`${existing.replace(/\n*$/, "\n\n")}${table}`);
  const before = lines.slice(0, block.start).join("\n");
  const after = lines.slice(block.end).join("\n");
  const separator = before.length === 0 ? "" : "\n";
  return finish(`${before}${separator}${table}${after.length === 0 ? "" : `\n${after}`}`);
};

/**
 * Refuse to write TOML that Codex could not read.
 * @param {string} text
 */
const finish = (text) => {
  Bun.TOML.parse(text);
  return text;
};
