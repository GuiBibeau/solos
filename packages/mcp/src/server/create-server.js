// @ts-check
import { McpServer } from "@modelcontextprotocol/server";
import { buildInstructions } from "./instructions.js";
import { filterByTier, registerTools } from "./register-tools.js";

export const SERVER_NAME = "solos";

/**
 * Build the MCP server over a ready Effect runtime. Transport is the caller's choice, so the
 * same function serves stdio today and HTTP later.
 * @param {{
 *   tools: ReadonlyArray<import("@solos/core").AnyToolDefinition>;
 *   runtime: import("effect").ManagedRuntime.ManagedRuntime<any, any>;
 *   version: string;
 *   tierCeiling?: "read" | "simulate" | "execute";
 * }} options
 */
export const createSolosServer = ({ tools, runtime, version, tierCeiling = "execute" }) => {
  const offered = filterByTier(tools, tierCeiling);
  const server = new McpServer(
    { name: SERVER_NAME, version },
    { instructions: buildInstructions(offered) },
  );
  registerTools(server, offered, runtime);
  return server;
};
