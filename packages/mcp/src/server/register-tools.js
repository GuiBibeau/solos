// @ts-check
import { annotationsForTier, requiresUserInteraction } from "@solos/core";
import { Effect } from "effect";
import { resultFromExit } from "./tool-result.js";

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
        const exit = await runtime.runPromiseExit(
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
          ),
        );
        return resultFromExit(exit);
      },
    );
  }
};
