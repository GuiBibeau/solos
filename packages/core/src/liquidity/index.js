// @ts-check
/** @typedef {import("./domain/errors.js").LiquidityError} LiquidityError */
/** @typedef {import("./domain/types.js").LiquidityGetPositionInput} LiquidityGetPositionInput */
/** @typedef {import("./domain/types.js").LiquidityGetPositionRequest} LiquidityGetPositionRequest */
/** @typedef {import("./domain/types.js").LiquidityListPositionsInput} LiquidityListPositionsInput */
/** @typedef {import("./domain/types.js").LiquidityListPositionsRequest} LiquidityListPositionsRequest */
/** @typedef {import("./domain/types.js").LiquidityEnumeration} LiquidityEnumeration */
/** @typedef {import("./domain/types.js").LpPosition} LpPosition */
/** @typedef {import("./ports/liquidity-venue.js").LiquidityVenueShape} LiquidityVenueShape */
export {
  LiquidityEnumerationIncomplete,
  LiquidityInputInvalid,
  LiquidityPositionUnavailable,
  LiquidityUnsupportedProtocol,
} from "./domain/errors.js";
export {
  LiquidityGetPositionInputSchema,
  LpPositionSchema,
  LiquidityListPositionsInputSchema,
} from "./domain/types.js";
export { LiquidityVenue } from "./ports/liquidity-venue.js";
export { getLpPosition } from "./use-cases/get-position.js";
export { listLpPositions } from "./use-cases/list-positions.js";
export { executeDeposit } from "./use-cases/execute-deposit.js";
export { simulateDeposit } from "./use-cases/simulate-deposit.js";
export { executeWithdraw } from "./use-cases/execute-withdraw.js";
export { simulateWithdraw } from "./use-cases/simulate-withdraw.js";
export {
  LiquidityDepositInputSchema,
  LiquidityExecuteDepositInputSchema,
} from "./domain/types.js";
export {
  LiquidityWithdrawInputSchema,
  LiquidityExecuteWithdrawInputSchema,
} from "./domain/types.js";
export { executeDepositTool } from "./tools/execute-deposit.js";
export { getLpPositionTool } from "./tools/get-position.js";
export {
  executeClosePositionTool,
  executeOpenPositionTool,
  simulateClosePositionTool,
  simulateOpenPositionTool,
} from "./tools/position-lifecycle.js";
export {
  executeClosePosition,
  executeOpenPosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "./use-cases/position-lifecycle.js";
export { simulateDepositTool } from "./tools/simulate-deposit.js";
export { executeWithdrawTool } from "./tools/execute-withdraw.js";
export { simulateWithdrawTool } from "./tools/simulate-withdraw.js";

import { executeDepositTool } from "./tools/execute-deposit.js";
import { executeWithdrawTool } from "./tools/execute-withdraw.js";
import { getLpPositionTool } from "./tools/get-position.js";
import {
  executeClosePositionTool,
  executeOpenPositionTool,
  simulateClosePositionTool,
  simulateOpenPositionTool,
} from "./tools/position-lifecycle.js";
import { simulateDepositTool } from "./tools/simulate-deposit.js";
import { simulateWithdrawTool } from "./tools/simulate-withdraw.js";

/**
 * The liquidity slice's public verbs. Position reads and owner enumeration are reads; the
 * deposit twins add liquidity to an explicitly identified existing position and the withdraw
 * twins remove a bounded percentage of one. The open and close twins create and retire a
 * position at a range the **caller** supplies — solOS validates that range and never chooses
 * one, so strategy stays upstream (ADR-0006). No rebalancing and no separate claim: a full
 * removal already sweeps fees and rewards.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const liquidityTools = [
  getLpPositionTool,
  simulateDepositTool,
  executeDepositTool,
  simulateWithdrawTool,
  executeWithdrawTool,
  simulateOpenPositionTool,
  executeOpenPositionTool,
  simulateClosePositionTool,
  executeClosePositionTool,
];
