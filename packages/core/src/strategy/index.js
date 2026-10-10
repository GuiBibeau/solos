// @ts-check
/** @typedef {import("./ports/cap-ledger.js").CapLedgerShape} CapLedgerShape */
/** @typedef {import("./ports/cap-ledger.js").ReserveRequest} ReserveRequest */
/** @typedef {import("./domain/cap-check.js").ReserveFacts} ReserveFacts */
/** @typedef {import("./ports/strategy-registry.js").StrategyRegistryShape} StrategyRegistryShape */
/** @typedef {import("./use-cases/memory-cap-ledger.js").MemoryCapLedgerOptions} MemoryCapLedgerOptions */
export { allowlistRefusal, widenedMint } from "./domain/allowlist.js";
export { reserveRefusal, utcDay } from "./domain/cap-check.js";
export { addDecimal, compareDecimal, subtractDecimal } from "./domain/decimal.js";
export {
  KillSwitchEngaged,
  StrategyInvalid,
  StrategyNotFound,
  StrategyTransitionRefused,
} from "./domain/errors.js";
export { firstTickActions } from "./domain/first-tick.js";
export { actualUsdFor, mintOf, reserveUsdFor } from "./domain/notional.js";
export { TickSchema } from "./domain/tick.js";
/** @typedef {import("./domain/tick.js").Tick} Tick */
export { refusalFor } from "./domain/transitions.js";
export { ulidFrom } from "./domain/ulid.js";
export { CadenceFloor } from "./ports/cadence-floor.js";
export { CapLedger, GLOBAL_KILL_SCOPE } from "./ports/cap-ledger.js";
export { EngineAllowlist } from "./ports/engine-allowlist.js";
export { IntentLookup } from "./ports/intent-lookup.js";
export { ObservationReader } from "./ports/observation-reader.js";
export { RunMode } from "./ports/run-mode.js";
export { SpendMeter } from "./ports/spend-meter.js";
export { StrategyIds } from "./ports/strategy-ids.js";
export { StrategyRegistry } from "./ports/strategy-registry.js";
export { StrategyRepository } from "./ports/strategy-repository.js";
export { TickRepository } from "./ports/tick-repository.js";
export { TickSource } from "./ports/tick-source.js";
export { TickSubmit } from "./ports/tick-submit.js";
export { executeDisengageKillTool } from "./tools/execute-disengage-kill.js";
export { executeEngageKillTool } from "./tools/execute-engage-kill.js";
export { executeRegisterTool } from "./tools/execute-register.js";
export { executeUpdateTool } from "./tools/execute-update.js";
export { getKillSwitchTool } from "./tools/get-kill-switch.js";
export { getStatusTool } from "./tools/get-status.js";
export { getTicksTool } from "./tools/get-ticks.js";
export { listStrategiesTool } from "./tools/list-strategies.js";
export { simulateRegisterTool } from "./tools/simulate-register.js";
export { simulateUpdateTool } from "./tools/simulate-update.js";
export { clockTickSource } from "./use-cases/clock-source.js";
export { registryConformance, repositoryConformance } from "./use-cases/conformance.js";
export {
  disengageKillSwitch,
  engageKillSwitch,
  killSwitchStatus,
  previewDisengageKill,
  previewEngageKill,
} from "./use-cases/kill-switch.js";
export { memoryCapLedger } from "./use-cases/memory-cap-ledger.js";
export { memoryStrategyRepository } from "./use-cases/memory-repository.js";
export { memoryTickRepository } from "./use-cases/memory-ticks.js";
export { recoverTicks } from "./use-cases/recover-ticks.js";
export {
  getStrategyStatus,
  getStrategyTicks,
  listStrategies,
  registerStrategy,
  simulateRegisterStrategy,
  simulateUpdateStrategy,
  updateStrategy,
  InProcessStrategyRegistry,
} from "./use-cases/registry-live.js";
export { runDueTicks } from "./use-cases/run-due.js";
export { scriptedObservationReader } from "./use-cases/scripted-reader.js";
export { scriptedSpendMeter } from "./use-cases/scripted-spend.js";

import { executeDisengageKillTool } from "./tools/execute-disengage-kill.js";
import { executeEngageKillTool } from "./tools/execute-engage-kill.js";
import { executeRegisterTool } from "./tools/execute-register.js";
import { executeUpdateTool } from "./tools/execute-update.js";
import { getKillSwitchTool } from "./tools/get-kill-switch.js";
import { getStatusTool } from "./tools/get-status.js";
import { getTicksTool } from "./tools/get-ticks.js";
import { listStrategiesTool } from "./tools/list-strategies.js";
import { simulateDisengageKillTool } from "./tools/simulate-disengage-kill.js";
import { simulateEngageKillTool } from "./tools/simulate-engage-kill.js";
import { simulateRegisterTool } from "./tools/simulate-register.js";
import { simulateUpdateTool } from "./tools/simulate-update.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const strategyTools = [
  listStrategiesTool,
  getStatusTool,
  getTicksTool,
  getKillSwitchTool,
  simulateRegisterTool,
  executeRegisterTool,
  simulateUpdateTool,
  executeUpdateTool,
  simulateEngageKillTool,
  executeEngageKillTool,
  simulateDisengageKillTool,
  executeDisengageKillTool,
];
