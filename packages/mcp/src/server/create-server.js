// @ts-check
import { McpServer } from "@modelcontextprotocol/server";
import { revealMatches, SEARCH_TOOL, withholdAllButBootstrap } from "./discovery.js";
import { buildInstructions } from "./instructions.js";
import { filterByExposure, registerTools } from "./register-tools.js";

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
 *   features?: { experimental: boolean };
 * }} options `discovery` (the default) withholds every tool but the bootstrap set until a search
 *   enables it (ADR-0029); `false` is `--tools all`, for clients that ignore list changes.
 *   `features.experimental` exposes the tools labelled experimental, withheld by default
 *   (ADR-0036).
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
  features = { experimental: false },
}) => {
  const exposure = { ceiling: tierCeiling, experimental: features.experimental };
  const offered = filterByExposure(tools, exposure);
  const server = new McpServer(
    { name: SERVER_NAME, version },
    { instructions: buildInstructions(tools, { ...exposure, discovery }) },
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
