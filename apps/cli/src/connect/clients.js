// @ts-check
/**
 * One adapter per MCP client: where its config lives for each scope, how the solos entry is
 * rendered for a human to read, and how it is merged into whatever the file already holds.
 * Other servers and settings in the file are never touched.
 */
import path from "node:path";
import { mcpServersConfig } from "./entry.js";
import { mergeCodexConfig, renderCodexTable } from "./toml.js";

/** @typedef {import("./entry.js").McpEntry} McpEntry */
/** @typedef {"user" | "project"} Scope */
/**
 * @typedef {{
 *   name: string;
 *   label: string;
 *   scopes: ReadonlyArray<Scope>;
 *   file: (scope: Scope, dirs: { home: string; cwd: string }) => string;
 *   render: (entry: McpEntry) => string;
 *   merge: (existing: string | null, entry: McpEntry) => string;
 *   next: string;
 * }} ClientAdapter
 */

/**
 * Set `mcpServers.solos` in a JSON config, keeping every other key and server.
 * @param {string | null} existing @param {McpEntry} entry
 */
const mergeJson = (existing, entry) => {
  const parsed = existing === null || existing.trim() === "" ? {} : JSON.parse(existing);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError("the existing config is not a JSON object");
  }
  const servers = /** @type {Record<string, unknown>} */ (parsed).mcpServers;
  const mcpServers = typeof servers === "object" && servers !== null ? servers : {};
  return `${JSON.stringify({ ...parsed, mcpServers: { ...mcpServers, solos: entry } }, null, 2)}\n`;
};

/** @param {McpEntry} entry */
const renderJson = (entry) => `${JSON.stringify(mcpServersConfig(entry), null, 2)}\n`;

/** @type {ClientAdapter} */
const claude = {
  name: "claude",
  label: "Claude Code",
  scopes: ["user", "project"],
  file: (scope, { home, cwd }) =>
    scope === "user" ? path.join(home, ".claude.json") : path.join(cwd, ".mcp.json"),
  render: renderJson,
  merge: mergeJson,
  next: "restart Claude Code, then `claude mcp get solos` shows the connection",
};

/** @type {ClientAdapter} */
const cursor = {
  name: "cursor",
  label: "Cursor",
  scopes: ["user", "project"],
  file: (scope, { home, cwd }) =>
    scope === "user"
      ? path.join(home, ".cursor", "mcp.json")
      : path.join(cwd, ".cursor", "mcp.json"),
  render: renderJson,
  merge: mergeJson,
  next: "open Cursor Settings > MCP; solos appears with its tools",
};

/** @type {ClientAdapter} */
const codex = {
  name: "codex",
  label: "Codex CLI",
  scopes: ["user"],
  file: (_scope, { home }) => path.join(home, ".codex", "config.toml"),
  render: renderCodexTable,
  merge: mergeCodexConfig,
  next: "start a new Codex session; `/mcp` lists solos",
};

export const CLIENTS = Object.freeze({ claude, codex, cursor });
export const CLIENT_NAMES = /** @type {const} */ (["claude", "codex", "cursor"]);
