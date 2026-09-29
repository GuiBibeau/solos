// @ts-check
import { McpServer } from "@modelcontextprotocol/server";
import { revealMatches, SEARCH_TOOL, withholdAllButBootstrap } from "./discovery.js";
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
 *   discovery?: boolean;
 * }} options `discovery` (the default) withholds every tool but the bootstrap set until a search
 *   enables it (ADR-0029); `false` is `--tools all`, for clients that ignore list changes.
 */
export const createSolosServer = ({
  tools,
  runtime,
  telemetry,
  version,
  // Simulate by default: a fresh install advertises read and simulate tools, and execute tools
  // appear only when the Operator raises the ceiling deliberately. See ADR-0029.
  tierCeiling = "simulate",
  discovery = true,
}) => {
  const offered = filterByTier(tools, tierCeiling);
  const server = new McpServer(
    { name: SERVER_NAME, version },
    { instructions: buildInstructions(tools, { ceiling: tierCeiling, discovery }) },
  );
  /** @type {Map<string, import("@modelcontextprotocol/server").RegisteredTool>} */
  const registered = new Map();
  /**
   * The search result's last stop: enable what it found, and say so.
   * @param {string} name @param {unknown} value
   */
  const decorate = (name, value) =>
    name === SEARCH_TOOL && typeof value === "object" && value !== null
      ? { ...value, enabled: revealMatches(registered, value) }
      : value;
  const handles = registerTools(server, offered, { runtime, telemetry, decorate });
  for (const [name, handle] of handles) registered.set(name, handle);
  if (discovery) withholdAllButBootstrap(registered);
  return server;
};
