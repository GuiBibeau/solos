// @ts-check
/**
 * A tool is a slice's public verb. One definition feeds both the MCP server and the
 * harness agent loop; neither knows about the other.
 *
 * @typedef {"read" | "simulate" | "execute"} ToolTier
 */

/**
 * @template {import("zod").ZodObject} Input
 * @template Output
 * @template E
 * @template R
 * @typedef {{
 *   readonly name: string;
 *   readonly group: string;
 *   readonly tier: ToolTier;
 *   readonly title: string;
 *   readonly description: string;
 *   readonly input: Input;
 *   readonly run: (input: import("zod").output<Input>) => import("effect").Effect.Effect<Output, E, R>;
 * }} ToolDefinition
 */

/**
 * Erased form used by registries and adapters. `run` takes `any` so heterogeneous tools
 * can live in one array; adapters always parse input with `tool.input` first.
 * @typedef {{
 *   readonly name: string;
 *   readonly group: string;
 *   readonly tier: ToolTier;
 *   readonly title: string;
 *   readonly description: string;
 *   readonly input: import("zod").ZodObject;
 *   readonly run: (input: any) => import("effect").Effect.Effect<unknown, unknown, any>;
 * }} AnyToolDefinition
 */

/**
 * Identity with type inference; keeps definitions declarative and lint-checkable.
 * @template {import("zod").ZodObject} Input
 * @template Output
 * @template E
 * @template R
 * @param {ToolDefinition<Input, Output, E, R>} definition
 * @returns {ToolDefinition<Input, Output, E, R>}
 */
export const defineTool = (definition) => Object.freeze(definition);

/**
 * MCP annotations derived from tier so every client sees consistent risk hints.
 * @param {ToolTier} tier
 */
export const annotationsForTier = (tier) => ({
  readOnlyHint: tier === "read",
  destructiveHint: tier === "execute",
  idempotentHint: tier !== "execute",
  openWorldHint: true,
});

/** @param {ToolTier} tier */
export const requiresUserInteraction = (tier) => tier === "execute";
