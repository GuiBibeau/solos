// @ts-check
import { Context } from "effect";

/**
 * Every tool the serving process knows, with its tier, and the tier ceiling it serves under
 * (ADR-0029). The search tool reads it to rank a request, to say which matches the ceiling
 * withholds, and to name the groups when nothing matches. Composition roots provide it from the
 * registry; core never imports the registry into a use case.
 * @typedef {{
 *   readonly tools: ReadonlyArray<import("../domain/types.js").CatalogueTool>;
 *   readonly ceiling: import("../domain/types.js").CatalogueTier;
 * }} ToolCatalogueShape
 */

export const ToolCatalogue = /** @type {Context.Tag<ToolCatalogueShape, ToolCatalogueShape>} */ (
  Context.GenericTag("@solos/discovery/ToolCatalogue")
);
