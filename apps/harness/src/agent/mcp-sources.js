// @ts-check
import { createMCPClient } from "@ai-sdk/mcp";
import { stdioTransport } from "@solos/mcp";

/**
 * Discover tools from third-party MCP servers listed in harness.config.js. The transport comes
 * from the repo's single MCP client module and is started by the AI SDK client, once. Every
 * discovered tool is exposed as `<server>__<tool>`, so a third-party server can never register a
 * name that shadows a solOS tool the signer stands behind.
 * @typedef {import("../config.js").HarnessConfig["mcpServers"][number]} ServerEntry
 * @typedef {{ tools: Record<string, import("ai").Tool>; groups: Record<string, string>; close: () => Promise<void> }} Discovered
 */

/** The longest tool name every selectable provider accepts (OpenAI and Anthropic: 64). */
export const MAX_TOOL_NAME_LENGTH = 64;

/**
 * `<server>__<tool>`, refused when it would exceed what a provider accepts: a rejected tool
 * declaration would fail the whole run at the model, after the servers were already started.
 * @param {string} server @param {string} tool
 */
export const externalToolName = (server, tool) => {
  const name = `${server}__${tool}`;
  if (name.length > MAX_TOOL_NAME_LENGTH) {
    throw new Error(
      `external tool name "${name}" exceeds ${MAX_TOOL_NAME_LENGTH} characters; shorten the server name in harness.config.js`,
    );
  }
  return name;
};

/** @param {ServerEntry} server */
const connectExternal = async (server) => {
  const client = await createMCPClient({
    transport: stdioTransport({ ...server, stderr: "ignore" }),
  });
  try {
    const discovered = Object.entries(await client.tools());
    return { client, discovered };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
};

/**
 * One connection per configured server. A later server failing closes every earlier one, so a
 * partial discovery never leaves spawned processes behind.
 * @param {ReadonlyArray<ServerEntry>} servers
 * @returns {Promise<Discovered>}
 */
export const discoverMcpTools = async (servers) => {
  /** @type {Record<string, import("ai").Tool>} */
  const tools = {};
  /** @type {Record<string, string>} */
  const groups = {};
  /** @type {Array<() => Promise<void>>} */
  const closers = [];
  const close = async () => {
    await Promise.allSettled(closers.map((closer) => closer()));
  };
  try {
    for (const server of servers) {
      const { client, discovered } = await connectExternal(server);
      closers.push(() => client.close());
      for (const [name, aiTool] of discovered) {
        const exposed = externalToolName(server.name, name);
        tools[exposed] = aiTool;
        groups[exposed] = server.name;
      }
    }
  } catch (error) {
    await close();
    throw error;
  }
  return { tools, groups, close };
};
