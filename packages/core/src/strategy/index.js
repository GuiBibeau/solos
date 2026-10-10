// @ts-check
/** @typedef {import("./ports/cap-ledger.js").CapLedgerShape} CapLedgerShape */
/** @typedef {import("./ports/cap-ledger.js").ReserveRequest} ReserveRequest */
/** @typedef {import("./domain/cap-check.js").ReserveFacts} ReserveFacts */
/** @typedef {import("./ports/strategy-registry.js").StrategyRegistryShape} StrategyRegistryShape */
/** @typedef {import("./use-cases/memory-cap-ledger.js").MemoryCapLedgerOptions} MemoryCapLedgerOptions */
export { allowlistRefusal, widenedMint } from "./domain/allowlist.js";
export { reserveRefusal, utcDay } from "./domain/cap-check.js";
export {
  KillSwitchEngaged,
  StrategyInvalid,
  StrategyNotFound,
  StrategyTransitionRefused,
} from "./domain/errors.js";
export { firstTickActions } from "./domain/first-tick.js";
export { refusalFor } from "./domain/transitions.js";
export { ulidFrom } from "./domain/ulid.js";
export { CapLedger, GLOBAL_KILL_SCOPE } from "./ports/cap-ledger.js";
export { EngineAllowlist } from "./ports/engine-allowlist.js";
export { StrategyIds } from "./ports/strategy-ids.js";
export { StrategyRegistry } from "./ports/strategy-registry.js";
export { StrategyRepository } from "./ports/strategy-repository.js";
export { executeRegisterTool } from "./tools/execute-register.js";
export { executeUpdateTool } from "./tools/execute-update.js";
export { getStatusTool } from "./tools/get-status.js";
export { listStrategiesTool } from "./tools/list-strategies.js";
export { simulateRegisterTool } from "./tools/simulate-register.js";
export { simulateUpdateTool } from "./tools/simulate-update.js";
export { registryConformance, repositoryConformance } from "./use-cases/conformance.js";
export { memoryCapLedger } from "./use-cases/memory-cap-ledger.js";
export { memoryStrategyRepository } from "./use-cases/memory-repository.js";
export {
  getStrategyStatus,
  listStrategies,
  registerStrategy,
  simulateRegisterStrategy,
  simulateUpdateStrategy,
  updateStrategy,
  InProcessStrategyRegistry,
} from "./use-cases/registry-live.js";

import { executeRegisterTool } from "./tools/execute-register.js";
import { executeUpdateTool } from "./tools/execute-update.js";
import { getStatusTool } from "./tools/get-status.js";
import { listStrategiesTool } from "./tools/list-strategies.js";
import { simulateRegisterTool } from "./tools/simulate-register.js";
import { simulateUpdateTool } from "./tools/simulate-update.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const strategyTools = [
  listStrategiesTool,
  getStatusTool,
  simulateRegisterTool,
  executeRegisterTool,
  simulateUpdateTool,
  executeUpdateTool,
];
