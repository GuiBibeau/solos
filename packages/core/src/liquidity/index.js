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
export {
  LiquidityDepositInputSchema,
  LiquidityExecuteDepositInputSchema,
} from "./domain/types.js";
export { executeDepositTool } from "./tools/execute-deposit.js";
export { getLpPositionTool } from "./tools/get-position.js";
export { simulateDepositTool } from "./tools/simulate-deposit.js";

import { executeDepositTool } from "./tools/execute-deposit.js";
import { getLpPositionTool } from "./tools/get-position.js";
import { simulateDepositTool } from "./tools/simulate-deposit.js";

/**
 * The liquidity slice's public verbs. Position reads and owner enumeration are reads; the
 * deposit twins add liquidity to an explicitly identified existing Orca position only —
 * no new positions, ranges, claims, or rebalancing. Removal is a separate slice.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const liquidityTools = [getLpPositionTool, simulateDepositTool, executeDepositTool];
