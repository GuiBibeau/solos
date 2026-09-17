// @ts-check
/**
 * The one MCP client in the repo. Used by black-box tests, `solos mcp ...`, and the harness
 * to discover third-party servers. The AI SDK only converts tools; it never owns a transport.
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/client/stdio";

/**
 * @typedef {{
 *   command: string;
 *   args?: string[];
 *   env?: Record<string, string>;
 *   cwd?: string;
 *   name?: string;
 *   stderr?: "inherit" | "pipe" | "ignore";
 * }} McpSpawnOptions
 */

/**
 * Spawn a stdio MCP server and connect. Only the given env keys are forwarded, on top of the
 * SDK's safe defaults (PATH, HOME, ...), so secrets never leak by accident.
 * @param {McpSpawnOptions} options
 */
export const connectMcp = async ({
  command,
  args = [],
  env = {},
  cwd,
  name = "solos-client",
  stderr = "inherit",
}) => {
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...getDefaultEnvironment(), ...env },
    cwd,
    stderr,
  });
  const client = new Client({ name, version: "0.0.0" });
  await client.connect(transport);
  return {
    client,
    transport,
    serverInfo: client.getServerVersion(),
    instructions: client.getInstructions(),
    listTools: async () => (await client.listTools()).tools,
    /**
     * @param {string} toolName
     * @param {Record<string, unknown>} toolArgs
     */
    callTool: (toolName, toolArgs) => client.callTool({ name: toolName, arguments: toolArgs }),
    close: () => client.close(),
  };
};

/** Parent callers select the environment; a server child must not reload ambient .env files. */
export const solosServerCommand = () => ({
  command: "bun",
  args: ["--no-env-file", new URL("../bin/stdio.js", import.meta.url).pathname],
});
