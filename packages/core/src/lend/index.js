// @ts-check
/** @typedef {import("./domain/errors.js").LendingError} LendingError */
/** @typedef {import("./domain/types.js").ReserveSnapshot} ReserveSnapshot */
/** @typedef {import("./domain/types.js").GetReserveInput} GetReserveInput */
/** @typedef {import("./domain/types.js").GetLendPositionInput} GetLendPositionInput */
/** @typedef {import("./domain/types.js").ListLendPositionsInput} ListLendPositionsInput */
/** @typedef {import("./domain/types.js").LendPosition} LendPosition */
/** @typedef {import("./domain/types.js").LendEnumeration} LendEnumeration */
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
export { formatApy } from "./domain/apy.js";
export {
  FractionalApySchema,
  GetLendPositionInputSchema,
  GetReserveInputSchema,
  LendPositionSchema,
  ListLendPositionsInputSchema,
  ReserveSnapshotSchema,
} from "./domain/types.js";
export { LendingVenue } from "./ports/lending-venue.js";
export { getReserve } from "./use-cases/get-reserve.js";
export { getLendPosition } from "./use-cases/get-position.js";
export { listLendPositions } from "./use-cases/list-positions.js";
export { getReserveTool } from "./tools/get-reserve.js";
export { getLendPositionTool } from "./tools/get-position.js";

import { getLendPositionTool } from "./tools/get-position.js";
import { getReserveTool } from "./tools/get-reserve.js";

/**
 * The lend slice's public verbs. Read-only today: one configured market's reserve rates and
 * available liquidity, no deposit, no withdraw, no rate routing.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const lendTools = [getReserveTool, getLendPositionTool];
