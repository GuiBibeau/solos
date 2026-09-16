// @ts-check
/** @typedef {import("./shared/tools/define-tool.js").AnyToolDefinition} AnyToolDefinition */
/** @typedef {import("./shared/tools/define-tool.js").ToolTier} ToolTier */
/** @typedef {import("./shared/domain/event.js").SolosEvent} SolosEvent */
/** @typedef {import("./shared/domain/address.js").Address} Address */
import { marketTools } from "./market/index.js";
import { swapTools } from "./swap/index.js";
import { transferTools } from "./transfer/index.js";
import { walletTools } from "./wallet/index.js";

export * from "./market/index.js";
export * from "./shared/index.js";
export * from "./signals/index.js";
export * from "./swap/index.js";
export * from "./transfer/index.js";
export * from "./wallet/index.js";

/**
 * Every tool solOS exposes, sorted by name for prompt-cache stability (ADR-0007).
 * @type {ReadonlyArray<import("./shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const allTools = [...walletTools, ...transferTools, ...swapTools, ...marketTools].toSorted(
  (a, b) => a.name.localeCompare(b.name),
);

/** Group names in display order, used for server instructions and per-step tool activation. */
export const toolGroups = [...new Set(allTools.map((t) => t.group))].toSorted((a, b) =>
  a.localeCompare(b),
);
