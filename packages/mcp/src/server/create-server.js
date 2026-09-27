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
 *   telemetry?: import("../runtime.js").PreflightTelemetry;
 *   version: string;
 *   tierCeiling?: "read" | "simulate" | "execute";
 * }} options
 */
export const createSolosServer = ({
  tools,
  runtime,
  telemetry,
  version,
  // Simulate by default: a fresh install advertises read and simulate tools, and execute tools
  // appear only when the Operator raises the ceiling deliberately. See ADR-0029.
  tierCeiling = "simulate",
}) => {
  const offered = filterByTier(tools, tierCeiling);
  const server = new McpServer(
    { name: SERVER_NAME, version },
    { instructions: buildInstructions(offered) },
  );
  registerTools(server, offered, { runtime, telemetry });
  return server;
};
