// @ts-check
import { annotationsForTier, LoggerJsonStderr, requiresUserInteraction } from "@solos/core";
import { Effect } from "effect";
import { resultFromExit, thrownResult } from "./tool-result.js";

/** @typedef {"read" | "simulate" | "execute"} Tier */
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
 * Preflight rejections keep ADR-0011's telemetry without the signer runtime: same span name and
 * `tool.failed` warning, through the stderr JSON logger only, so stdout stays JSON-RPC and no
 * Layer that could fail loading is ever built. Telemetry must never mask the structured error.
 * @param {string} toolName
 * @param {unknown} error
 */
const observePreflightFailure = async (toolName, error) => {
  const observed = Effect.logWarning("tool.failed").pipe(
    Effect.annotateLogs({ tool: toolName, cause: String(error) }),
    Effect.withSpan(`mcp.tool.${toolName}`),
    Effect.provide(LoggerJsonStderr(process.env.SOLOS_LOG_LEVEL)),
  );
  await Effect.runPromise(observed).catch(() => undefined);
};

/**
 * @param {import("@modelcontextprotocol/server").McpServer} server
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} tools
 * @param {import("effect").ManagedRuntime.ManagedRuntime<any, any>} runtime
 */
export const registerTools = (server, tools, runtime) => {
  for (const tool of tools) {
    server.registerTool(
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
            await observePreflightFailure(tool.name, error);
            return thrownResult(error);
          }
        }
        const exit = await runtime.runPromiseExit(observedRun(tool, input));
        return resultFromExit(exit);
      },
    );
  }
};
