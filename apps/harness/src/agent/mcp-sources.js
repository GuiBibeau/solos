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

/** @param {string} server @param {string} tool */
export const externalToolName = (server, tool) => `${server}__${tool}`;

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
