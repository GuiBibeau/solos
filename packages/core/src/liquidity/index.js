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
export { getLpPositionTool } from "./tools/get-position.js";

import { getLpPositionTool } from "./tools/get-position.js";

/**
 * The liquidity slice's public verbs. Read-only today: position reads and owner
 * enumeration only — no deposits, withdrawals, claims, or rebalancing.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const liquidityTools = [getLpPositionTool];
