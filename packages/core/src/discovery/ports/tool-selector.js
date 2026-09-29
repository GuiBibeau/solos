// @ts-check
import { Context } from "effect";

/**
 * Ranks the tool registry against one free-text request (ADR-0029). Group and explicit-name
 * lookups never reach a selector; they are exact and stay local.
 * @typedef {{
 *   readonly query: string;
 *   readonly tools: ReadonlyArray<import("../domain/types.js").ToolSummary>;
 * }} SelectRequest
 * @typedef {{
 *   readonly name: string;
 *   readonly select: (request: SelectRequest) => import("effect").Effect.Effect<ReadonlyArray<import("../domain/types.js").ToolMatch>, import("../domain/errors.js").ToolSelectorUnavailable>;
 * }} ToolSelectorShape
 */

export const ToolSelector = /** @type {Context.Tag<ToolSelectorShape, ToolSelectorShape>} */ (
  Context.GenericTag("@solos/discovery/ToolSelector")
);
