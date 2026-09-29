// @ts-check
import { annotationsForTier, requiresUserInteraction } from "@solos/core";
import { Effect, Exit } from "effect";
import { errorResult, successResult, thrownResult } from "./tool-result.js";

/** @typedef {"read" | "simulate" | "execute"} Tier */
/** @typedef {import("@modelcontextprotocol/server").RegisteredTool} RegisteredTool */
const TIER_RANK = /** @type {Record<Tier, number>} */ ({ read: 0, simulate: 1, execute: 2 });

/**
 * A deployment may cap what it offers (e.g. a read-only server) by dropping higher tiers.
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} tools
 * @param {Tier} ceiling
 */
export const filterByTier = (tools, ceiling) =>
  tools.filter((tool) => TIER_RANK[tool.tier] <= TIER_RANK[ceiling]);

/**
 * The observed run of one tool: span, completion and failure logs around the use case.
 * @param {import("@solos/core").AnyToolDefinition} tool
 * @param {any} input
 */
const observedRun = (tool, input) =>
  tool.run(input).pipe(
    Effect.withSpan(`mcp.tool.${tool.name}`),
    Effect.tap(() =>
      Effect.logInfo("tool.completed").pipe(Effect.annotateLogs({ tool: tool.name })),
    ),
    Effect.tapErrorCause((cause) =>
      Effect.logWarning("tool.failed").pipe(
        Effect.annotateLogs({ tool: tool.name, cause: String(cause) }),
      ),
    ),
  );

/**
 * @typedef {{
 *   runtime: import("effect").ManagedRuntime.ManagedRuntime<any, any>;
 *   telemetry?: import("../runtime.js").PreflightTelemetry;
 *   decorate?: (toolName: string, value: unknown) => unknown;
 * }} Runners `decorate` is a success value's last stop before it is packaged; discovery uses it
 *   to enable what a search found and to say so in the result.
 */

/**
 * @param {import("@modelcontextprotocol/server").McpServer} server
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} tools
 * @param {Runners} runners
 * @returns {Map<string, RegisteredTool>} every registration by name, so discovery can withhold
 *   and reveal
 */
export const registerTools = (server, tools, runners) => {
  const { runtime, telemetry, decorate = (_name, value) => value } = runners;
  /** @type {Map<string, RegisteredTool>} */
  const registered = new Map();
  for (const tool of tools) {
    const handle = server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: annotationsForTier(tool.tier),
        _meta: {
          "anthropic/requiresUserInteraction": requiresUserInteraction(tool.tier),
          "solos/tier": tool.tier,
          "solos/group": tool.group,
        },
      },
      /** @param {unknown} args */
      async (args) => {
        const input = tool.input.parse(args);
        // Pure input guards precede the runtime: the ManagedRuntime builds its Layer on first
        // run, so a guard rejection must happen here or a broken signer would mask it.
        if (tool.check !== undefined) {
          try {
            tool.check(input);
          } catch (error) {
            await telemetry?.observe(tool.name, error);
            return thrownResult(error);
          }
        }
        const exit = await runtime.runPromiseExit(observedRun(tool, input));
        return Exit.isSuccess(exit)
          ? successResult(decorate(tool.name, exit.value))
          : errorResult(exit.cause);
      },
    );
    registered.set(tool.name, handle);
  }
  return registered;
};
