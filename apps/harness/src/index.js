// @ts-check
/** @typedef {import("./agent/tool-ceiling.js").Tier} Tier */
export { createSolosAgent } from "./agent/create-agent.js";
export { discoverMcpTools, externalToolName } from "./agent/mcp-sources.js";
export {
  INVALID_FEATURES,
  TierSchema,
  canAdmitExternalTools,
  featureFlags,
  tierCeiling,
} from "./agent/tool-ceiling.js";
export { groupIndex, toolsFromDefinitions } from "./agent/tools-from-definitions.js";
export { loadHarness, makeHarnessRuntime } from "./composition.js";
export {
  HarnessConfigSchema,
  ReasoningSchema,
  TaskClassSchema,
  loadHarnessConfig,
  loadHarnessEnv,
} from "./config.js";
export { runDaemon } from "./daemon/daemon.js";
export { TracingLive } from "./observability/tracing.js";
export { PRESETS } from "./router/presets.js";
export { Router, RouterLive, callSettingsFor, resolveRoute } from "./router/router.js";
export { StoreSqlite } from "./store/sqlite-store.js";
