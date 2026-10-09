// @ts-check
/**
 * A tool is a slice's public verb. One definition feeds both the MCP server and the
 * harness agent loop; neither knows about the other.
 *
 * @typedef {"read" | "simulate" | "execute"} ToolTier
 * @typedef {"experimental" | "beta" | "stable"} Stability The compatibility promise a tool makes
 *   (ADR-0036): stable changes only in a major, beta may change in a minor, experimental may
 *   change or disappear in any release and is exposed only when the Operator enables it.
 */

/** Every stability label, for validation and for the docs gate. */
export const STABILITIES = Object.freeze(["experimental", "beta", "stable"]);

/**
 * @template {import("zod").ZodObject} Input
 * @template Output
 * @template E
 * @template R
 * @typedef {{
 *   readonly name: string;
 *   readonly group: string;
 *   readonly tier: ToolTier;
 *   readonly stability: Stability;
 *   readonly action?: string;
 *   readonly title: string;
 *   readonly description: string;
 *   readonly input: Input;
 *   readonly run: (input: import("zod").output<Input>) => import("effect").Effect.Effect<Output, E, R>;
 *   readonly check?: (input: import("zod").output<Input>) => void;
 * }} ToolDefinition
 */

/**
 * Erased form used by registries and adapters. `run` takes `any` so heterogeneous tools
 * can live in one array; adapters always parse input with `tool.input` first.
 * @typedef {{
 *   readonly name: string;
 *   readonly group: string;
 *   readonly tier: ToolTier;
 *   readonly stability: Stability;
 *   readonly action?: string;
 *   readonly title: string;
 *   readonly description: string;
 *   readonly input: import("zod").ZodObject;
 *   readonly run: (input: any) => import("effect").Effect.Effect<unknown, unknown, any>;
 *   readonly check?: (input: any) => void;
 * }} AnyToolDefinition
 */

/**
 * Identity with type inference; keeps definitions declarative and lint-checkable. `action` is
 * the Action type a simulate or execute tool builds, so the docs gate can find its
 * live-validated row in the feature map; a read tool builds none.
 * @template {import("zod").ZodObject} Input
 * @template Output
 * @template E
 * @template R
 * @param {ToolDefinition<Input, Output, E, R>} definition
 * @returns {ToolDefinition<Input, Output, E, R>}
 */
export const defineTool = (definition) => Object.freeze(definition);

/**
 * The description an MCP client receives: the registry's text, and for a tool that is not
 * stable a short suffix at the end, so an agent sees the promise without a side channel while
 * the first sentence discovery matches on stays unchanged (ADR-0036).
 * @param {{ description: string; stability: Stability }} tool
 */
export const mcpDescription = ({ description, stability }) =>
  stability === "stable" ? description : `${description} (${stability})`;

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
