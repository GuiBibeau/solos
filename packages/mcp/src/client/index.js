// @ts-check
/**
 * The one MCP client in the repo. Used by black-box tests, `solos mcp ...`, and the harness
 * to discover third-party servers. The AI SDK only converts tools; it never owns a transport.
 */
import { fileURLToPath } from "node:url";
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
 * A stdio transport that is not yet started, for a client that starts it itself (the AI SDK's
 * MCP client does). Only the given env keys are forwarded, on top of the SDK's safe defaults.
 * @param {Omit<McpSpawnOptions, "name" | "onToolListChanged">} options
 */
export const stdioTransport = ({ command, args = [], env = {}, cwd, stderr = "inherit" }) =>
  new StdioClientTransport({
    command,
    args,
    env: { ...getDefaultEnvironment(), ...env },
    cwd,
    stderr,
  });

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
  const transport = stdioTransport({ command, args, env, cwd, stderr });
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

/** The subcommand under which an installed `solos` serves MCP over stdio (ADR-0035). */
export const SERVE_ARGS = Object.freeze(["mcp", "serve"]);

/**
 * Inside a compiled executable, modules live in Bun's virtual filesystem: `/$bunfs/` on Unix,
 * `/~BUN/` on Windows. A module URL there means "this process is the binary".
 */
const COMPILED_URL = /\/\$bunfs\/|\/~BUN\//;

/**
 * The command that starts this server, kept pure for tests. From a checkout it is
 * `bun --no-env-file <stdio.js>`: parent callers select the environment, and a server child
 * must not reload ambient `.env` files. From a compiled binary it is the binary itself with
 * `mcp serve`; `solos dev build` turns dotenv autoload off, so the isolation is the same.
 * @param {{ executable: string; moduleUrl: string }} input the running executable and this
 *   module's `import.meta.url`
 * @returns {{ command: string; args: string[] }}
 */
export const serverCommandFor = ({ executable, moduleUrl }) =>
  COMPILED_URL.test(moduleUrl)
    ? { command: executable, args: [...SERVE_ARGS] }
    : {
        command: "bun",
        args: ["--no-env-file", fileURLToPath(new URL("../bin/stdio.js", moduleUrl))],
      };

/** Spawn our own server the way an external client would, whichever way this process runs. */
export const solosServerCommand = () =>
  serverCommandFor({ executable: process.execPath, moduleUrl: import.meta.url });
