// @ts-check
/** @typedef {import("./domain/types.js").TransferSolInput} TransferSolInput */
/** @typedef {import("./domain/types.js").TransferSolRequest} TransferSolRequest */
/** @typedef {import("./domain/types.js").TransferReceipt} TransferReceipt */
/** @typedef {import("./domain/types.js").SimulationResult} SimulationResult */
export { InsufficientFunds } from "./domain/errors.js";
export {
  SimulationResultSchema,
  TransferReceiptSchema,
  TransferSolInputSchema,
  TransferSolRequestSchema,
} from "./domain/types.js";
export { sendSolTool } from "./tools/send-sol.js";
export { simulateSolTool } from "./tools/simulate-sol.js";
export { sendSol } from "./use-cases/send-sol.js";
export { simulateSol } from "./use-cases/simulate-sol.js";
export { toTransferAction } from "./use-cases/to-action.js";

import { sendSolTool } from "./tools/send-sol.js";
import { simulateSolTool } from "./tools/simulate-sol.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const transferTools = [simulateSolTool, sendSolTool];
