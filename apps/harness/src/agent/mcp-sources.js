// @ts-check
import { createMCPClient } from "@ai-sdk/mcp";
import { connectMcp } from "@solos/mcp";

/**
 * Discover tools from third-party MCP servers listed in harness.config.js. The transport comes
 * from the repo's single MCP client; the AI SDK only converts tool definitions.
 * @param {ReadonlyArray<import("../config.js").HarnessConfig["mcpServers"][number]>} servers
 * @returns {Promise<{ tools: Record<string, import("ai").Tool>; groups: Record<string, string>; close: () => Promise<void> }>}
 */
export const discoverMcpTools = async (servers) => {
  /** @type {Record<string, import("ai").Tool>} */
  const tools = {};
  /** @type {Record<string, string>} */
  const groups = {};
  /** @type {Array<() => Promise<void>>} */
  const closers = [];
  for (const server of servers) {
    const connection = await connectMcp({
      ...server,
      name: `solos-harness:${server.name}`,
      stderr: "ignore",
    });
    const client = await createMCPClient({ transport: connection.transport });
    const discovered = Object.entries(await client.tools());
    for (const [name, aiTool] of discovered) {
      tools[name] = aiTool;
      groups[name] = server.name;
    }
    closers.push(() => client.close());
  }
  return {
    tools,
    groups,
    close: async () => {
      await Promise.allSettled(closers.map((close) => close()));
    },
  };
};
