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

/** The solos table itself or any descendant table, `[mcp_servers.solos.env]` included. */
const SOLOS_HEADER = /^\s*\[\s*mcp_servers\.solos(?:\.[^\]]+)?\s*\]\s*(?:#.*)?$/;
const ANY_HEADER = /^\s*\[/;

/**
 * Every line that belongs to the solos table or one of its descendant tables is dropped, and
 * the index where the first of them stood is where the new table goes, so an entry whose env was
 * written as `[mcp_servers.solos.env]` cannot survive a replacement.
 * @param {string[]} lines
 * @returns {{ kept: string[]; insertAt: number }} insertAt is -1 when no solos table existed
 */
const withoutSolos = (lines) => {
  /** @type {string[]} */
  const kept = [];
  let insertAt = -1;
  let isDropping = false;
  for (const line of lines) {
    if (ANY_HEADER.test(line)) isDropping = SOLOS_HEADER.test(line);
    if (!isDropping) {
      kept.push(line);
    } else if (insertAt === -1) {
      insertAt = kept.length;
    }
  }
  return { kept, insertAt };
};

/** One blank line between tables, one newline at the end, nothing else. @param {string} text */
const trimBlock = (text) => text.replaceAll(/^\n+|\n+$/g, "");

/**
 * @param {string | null} existing the current file text, or null when there is no file
 * @param {import("./entry.js").McpEntry} entry
 */
export const mergeCodexConfig = (existing, entry) => {
  const table = renderCodexTable(entry);
  if (existing === null || existing.trim() === "") return finish(table);
  const { kept, insertAt } = withoutSolos(existing.split("\n"));
  if (insertAt === -1) return finish(`${trimBlock(existing)}\n\n${table}`);
  const before = trimBlock(kept.slice(0, insertAt).join("\n"));
  const after = trimBlock(kept.slice(insertAt).join("\n"));
  const parts = [before, trimBlock(table), after].filter((part) => part.length > 0);
  return finish(`${parts.join("\n\n")}\n`);
};

/**
 * Refuse to write TOML that Codex could not read.
 * @param {string} text
 */
const finish = (text) => {
  Bun.TOML.parse(text);
  return text;
};
