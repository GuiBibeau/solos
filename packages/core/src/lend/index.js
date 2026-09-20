// @ts-check
/** @typedef {import("./domain/errors.js").LendingError} LendingError */
/** @typedef {import("./domain/types.js").ReserveSnapshot} ReserveSnapshot */
/** @typedef {import("./domain/types.js").GetReserveInput} GetReserveInput */
export {
  LendingInputInvalid,
  LendingLayoutUnsupported,
  LendingMarketUnavailable,
  LendingResponseInvalid,
  LendingTimeout,
  ReserveUnavailable,
} from "./domain/errors.js";
export { formatApy } from "./domain/apy.js";
export {
  FractionalApySchema,
  GetReserveInputSchema,
  ReserveSnapshotSchema,
} from "./domain/types.js";
export { LendingVenue } from "./ports/lending-venue.js";
export { getReserve } from "./use-cases/get-reserve.js";
export { getReserveTool } from "./tools/get-reserve.js";

import { getReserveTool } from "./tools/get-reserve.js";

/**
 * The lend slice's public verbs. Read-only today: one configured market's reserve rates and
 * available liquidity, no deposit, no withdraw, no rate routing.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const lendTools = [getReserveTool];
