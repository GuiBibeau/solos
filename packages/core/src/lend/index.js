// @ts-check
/** @typedef {import("./domain/errors.js").LendingError} LendingError */
/** @typedef {import("./domain/types.js").ReserveSnapshot} ReserveSnapshot */
/** @typedef {import("./domain/types.js").GetReserveInput} GetReserveInput */
/** @typedef {import("./domain/types.js").GetLendPositionInput} GetLendPositionInput */
/** @typedef {import("./domain/types.js").ListLendPositionsInput} ListLendPositionsInput */
/** @typedef {import("./domain/types.js").LendPosition} LendPosition */
/** @typedef {import("./domain/types.js").LendEnumeration} LendEnumeration */

export { formatApy } from "./domain/apy.js";
export {
  LendingEnumerationIncomplete,
  LendingInputInvalid,
  LendingLayoutUnsupported,
  LendingMarketUnavailable,
  LendingObligationInvalid,
  LendingResponseInvalid,
  LendingTimeout,
  ReserveUnavailable,
} from "./domain/errors.js";
export {
  FractionalApySchema,
  GetLendPositionInputSchema,
  GetReserveInputSchema,
  LendPositionSchema,
  ListLendPositionsInputSchema,
  ReserveSnapshotSchema,
} from "./domain/types.js";
export { LendingVenue } from "./ports/lending-venue.js";
export { executeDepositTool as executeLendDepositTool } from "./tools/execute-deposit.js";
export { executeWithdrawTool as executeLendWithdrawTool } from "./tools/execute-withdraw.js";
export { getLendPositionTool } from "./tools/get-position.js";
export { getReserveTool } from "./tools/get-reserve.js";
export { simulateDepositTool as simulateLendDepositTool } from "./tools/simulate-deposit.js";
export { simulateWithdrawTool as simulateLendWithdrawTool } from "./tools/simulate-withdraw.js";
export { executeDeposit as executeLendDeposit } from "./use-cases/execute-deposit.js";
export { executeWithdraw as executeLendWithdraw } from "./use-cases/execute-withdraw.js";
export { getLendPosition } from "./use-cases/get-position.js";
export { getReserve } from "./use-cases/get-reserve.js";
export { listLendPositions } from "./use-cases/list-positions.js";
// Use-case and tool names are prefixed for the package root, where the liquidity slice's
// deposit twins already own the short names; inside the slice the domain names stand.
export { simulateDeposit as simulateLendDeposit } from "./use-cases/simulate-deposit.js";
export { simulateWithdraw as simulateLendWithdraw } from "./use-cases/simulate-withdraw.js";

import { executeDepositTool } from "./tools/execute-deposit.js";
import { executeWithdrawTool } from "./tools/execute-withdraw.js";
import { getLendPositionTool } from "./tools/get-position.js";
import { getReserveTool } from "./tools/get-reserve.js";
import { simulateDepositTool } from "./tools/simulate-deposit.js";
import { simulateWithdrawTool } from "./tools/simulate-withdraw.js";

/**
 * The lend slice's public verbs. Reads plus supply deposits into the one configured market;
 * withdrawals follow in the next track (ADR-0019 gates funded deposits on a checked exit).
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const lendTools = [
  getReserveTool,
  getLendPositionTool,
  simulateDepositTool,
  executeDepositTool,
  simulateWithdrawTool,
  executeWithdrawTool,
];
