// @ts-check
/**
 * The MCP server entry a client config carries for solos: the command that starts this very
 * installation (a checkout's `bun --no-env-file <stdio.js>`, or the compiled binary with
 * `mcp serve`, ADR-0035), the ceiling and discovery flags the Operator chose, and the profile
 * when one is named. Secrets never go in: the server resolves them from the profile (ADR-0015).
 */
import { solosServerCommand } from "@solos/mcp";

/** @typedef {{ command: string; args: string[]; env: Record<string, string> }} McpEntry */

/**
 * @param {{ tier?: string | undefined; tools?: string | undefined; profile?: string | undefined }} options
 * @returns {McpEntry}
 */
export const serverEntry = ({ tier, tools, profile } = {}) => {
  const { command, args } = solosServerCommand();
  const flags = [...(tier ? ["--tier", tier] : []), ...(tools ? ["--tools", tools] : [])];
  return { command, args: [...args, ...flags], env: profile ? { SOLOS_PROFILE: profile } : {} };
};

/**
 * The `mcpServers` shape Claude Code and Cursor read, with solos as its one entry.
 * @param {McpEntry} entry
 */
export const mcpServersConfig = (entry) => ({ mcpServers: { solos: entry } });
