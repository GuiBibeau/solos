// @ts-check
/** @typedef {import("./domain/types.js").ToolMatch} ToolMatch */
/** @typedef {import("./domain/types.js").ToolSummary} ToolSummary */
/** @typedef {import("./ports/tool-selector.js").ToolSelectorShape} ToolSelectorShape */
export { SelectionInputInvalid, ToolSelectorUnavailable } from "./domain/errors.js";
export { localMatches } from "./domain/local-match.js";
export { ToolMatchSchema, ToolSummarySchema } from "./domain/types.js";
export { ToolSelector } from "./ports/tool-selector.js";
export { DEFAULT_SELECTION_LIMIT, selectTools } from "./use-cases/select-tools.js";
