// @ts-check
/** @typedef {import("./domain/types.js").ToolMatch} ToolMatch */
/** @typedef {import("./domain/types.js").ToolSummary} ToolSummary */
/** @typedef {import("./domain/types.js").CatalogueTool} CatalogueTool */
/** @typedef {import("./domain/types.js").CatalogueTier} CatalogueTier */
/** @typedef {import("./domain/types.js").Stability} Stability */
/** @typedef {import("./domain/types.js").SearchToolsInput} SearchToolsInput */
/** @typedef {import("./ports/tool-selector.js").ToolSelectorShape} ToolSelectorShape */
/** @typedef {import("./ports/tool-catalogue.js").ToolCatalogueShape} ToolCatalogueShape */
import { searchToolsTool } from "./tools/search-tools.js";

export { catalogueOf, isExposed, isWithinCeiling } from "./domain/catalogue.js";
export { SelectionInputInvalid, ToolSelectorUnavailable } from "./domain/errors.js";
export { localMatches } from "./domain/local-match.js";
export {
  CatalogueToolSchema,
  SearchToolsInputSchema,
  StabilitySchema,
  ToolMatchSchema,
  ToolSummarySchema,
  ToolTierSchema,
} from "./domain/types.js";
export { ToolCatalogue } from "./ports/tool-catalogue.js";
export { ToolSelector } from "./ports/tool-selector.js";
export { searchTools } from "./use-cases/search-tools.js";
export { searchToolsTool } from "./tools/search-tools.js";
export { DEFAULT_SELECTION_LIMIT, selectTools } from "./use-cases/select-tools.js";

/** The discovery slice's one tool: the entry point a Caller uses to find every other tool. */
export const discoveryTools = [searchToolsTool];
