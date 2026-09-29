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
 *   onToolListChanged?: (tools: ReadonlyArray<import("@modelcontextprotocol/client").Tool>) => void;
 * }} McpSpawnOptions `onToolListChanged` runs after the SDK has re-fetched the list on a
 *   `tools/list_changed` notification, with the tools now advertised.
 */

/**
 * The SDK re-fetches the tool list on `tools/list_changed` and hands it over here.
 * @param {McpSpawnOptions["onToolListChanged"]} onToolListChanged
 * @returns {ConstructorParameters<typeof Client>[1]}
 */
const clientOptions = (onToolListChanged) =>
  onToolListChanged === undefined
    ? undefined
    : {
        listChanged: {
          tools: {
            onChanged: (error, tools) => {
              if (error === null && tools !== null) onToolListChanged(tools);
            },
          },
        },
      };

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
  onToolListChanged,
}) => {
  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...getDefaultEnvironment(), ...env },
    cwd,
    stderr,
  });
  const client = new Client({ name, version: "0.0.0" }, clientOptions(onToolListChanged));
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
     * @param {{ timeout?: number }} [options]
     */
    callTool: (toolName, toolArgs, options) =>
      client.callTool({ name: toolName, arguments: toolArgs }, options),
    close: () => client.close(),
  };
};

/** Parent callers select the environment; a server child must not reload ambient .env files. */
export const solosServerCommand = () => ({
  command: "bun",
  args: ["--no-env-file", new URL("../bin/stdio.js", import.meta.url).pathname],
});
