// @ts-check
import { resultFromExit, thrownResult } from "@solos/mcp";
import { tool } from "ai";
import { Effect } from "effect";

/**
 * Core tool definitions as AI SDK tools, executed on the shared Effect runtime. The model sees
 * the same names, descriptions, and schemas that MCP clients see, and the same pure input guard
 * runs before the runtime, so a rejection is the same structured error on both surfaces.
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} definitions
 * @param {import("effect").ManagedRuntime.ManagedRuntime<any, any>} runtime
 * @returns {Record<string, import("ai").Tool>}
 */
export const toolsFromDefinitions = (definitions, runtime) =>
  Object.fromEntries(
    definitions.map((definition) => [
      definition.name,
      tool({
        description: definition.description,
        inputSchema: definition.input,
        execute: async (input) => {
          if (definition.check !== undefined) {
            try {
              definition.check(input);
            } catch (error) {
              return thrownResult(error).structuredContent;
            }
          }
          const exit = await runtime.runPromiseExit(
            definition.run(input).pipe(Effect.withSpan(`agent.tool.${definition.name}`)),
          );
          return resultFromExit(exit).structuredContent;
        },
      }),
    ]),
  );

/**
 * @param {ReadonlyArray<import("@solos/core").AnyToolDefinition>} definitions
 * @returns {Record<string, string>} tool name → group
 */
export const groupIndex = (definitions) =>
  Object.fromEntries(definitions.map((d) => [d.name, d.group]));
