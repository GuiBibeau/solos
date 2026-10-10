// @ts-check
/** @typedef {import("./ports/action-executor.js").ActionExecutorShape} ActionExecutorShape */
/** @typedef {import("./ports/action-executor.js").ExecutorError} ExecutorError */
export { AddressSchema, SignatureSchema } from "./domain/address.js";
export { base58ByteLength } from "./domain/base58.js";
export { errorEnvelope } from "./domain/error-envelope.js";
export {
  BoundsExceeded,
  BuildRejected,
  BuildUnavailable,
  InternalError,
  RpcConfigMissing,
  RpcError,
  SignerConfigMissing,
  SignerUnavailable,
  SimulationFailed,
  TransactionExpired,
  TransactionFailed,
  UnsupportedAction,
  ValidationError,
} from "./domain/errors.js";
export { BaseEventSchema, makeEvent } from "./domain/event.js";
export { toJsonSafe } from "./domain/json.js";
export {
  LAMPORTS_PER_SOL,
  LamportsSchema,
  SolAmountSchema,
  lamportsToSol,
  solToLamports,
} from "./domain/lamports.js";
export { domainErrors, taggedError } from "./domain/tagged-error.js";
export { EventBusInMemory } from "./layers/event-bus-in-memory.js";
export { EventSinkNoop } from "./layers/event-sink-noop.js";
export { LoggerJsonStderr, parseLogLevel } from "./layers/logger-json-stderr.js";
export { StoreInMemory } from "./layers/store-in-memory.js";
export { ActionExecutor } from "./ports/action-executor.js";
export { EventBus } from "./ports/event-bus.js";
export { EventSink } from "./ports/event-sink.js";
export { Store } from "./ports/store.js";
export {
  STABILITIES,
  annotationsForTier,
  defineTool,
  mcpDescription,
  requiresUserInteraction,
} from "./tools/define-tool.js";
export { validateTool } from "./tools/validate-tool.js";
export { executeAction } from "./use-cases/execute-action.js";
export { simulateAction } from "./use-cases/simulate-action.js";
