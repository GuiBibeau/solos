// @ts-check
/** @typedef {import("./domain/errors.js").PerpError} PerpError */
/** @typedef {import("./domain/types.js").GetPositionInput} GetPositionInput */
/** @typedef {import("./domain/types.js").GetPositionRequest} GetPositionRequest */
/** @typedef {import("./domain/types.js").GetPositionResult} GetPositionResult */
/** @typedef {import("./domain/types.js").ListPositionsInput} ListPositionsInput */
/** @typedef {import("./domain/types.js").ListPositionsInput["owner"]} ListOwner */
/** @typedef {import("./domain/types.js").PerpEnumeration} PerpEnumeration */
/** @typedef {import("./domain/types.js").PerpPosition} PerpPosition */
/** @typedef {import("./domain/types.js").PerpAccount} PerpAccount */
/** @typedef {import("./ports/perp-venue.js").PerpVenueShape} PerpVenueShape */
export {
  NoPositionToClose,
  PerpAccountCorrupt,
  PerpAuthFailed,
  PerpEnumerationIncomplete,
  PerpHttpError,
  PerpInputInvalid,
  PerpMarketUnknown,
  PerpNetworkError,
  PerpRateLimited,
  PerpResponseInvalid,
  PerpStateIncomplete,
  PerpTimeout,
} from "./domain/errors.js";
export {
  QUOTE_LOTS_DECIMALS,
  lotsToBaseUnits,
  parseLots,
  quoteLotsToUsd,
  sideFromLots,
} from "./domain/lots.js";
export { normalizeMarketSymbol } from "./domain/symbol.js";
export { equityUsdFromSubaccount } from "./domain/equity.js";
export {
  GetPositionInputSchema,
  ListPositionsInputSchema,
  PerpAccountSchema,
  PerpPositionSchema,
} from "./domain/types.js";
export { PerpVenue } from "./ports/perp-venue.js";
export { PerpOnboarder } from "./ports/perp-onboarder.js";
export {
  getOnboardingStatus,
  simulateOnboardTrader,
  executeOnboardTrader,
} from "./use-cases/onboard-trader.js";
export {
  getOnboardingStatusTool,
  simulateOnboardTraderTool,
  executeOnboardTraderTool,
} from "./tools/onboarding-tools.js";
export {
  simulatePerpDeposit,
  executePerpDeposit,
  simulatePerpWithdrawal,
  executePerpWithdrawal,
} from "./use-cases/collateral.js";
export {
  simulatePerpDepositTool,
  executePerpDepositTool,
  simulatePerpWithdrawalTool,
  executePerpWithdrawalTool,
} from "./tools/collateral-tools.js";
export { simulatePerpOpen, executePerpOpen } from "./use-cases/open.js";
export { simulatePerpOpenTool, executePerpOpenTool } from "./tools/open-tools.js";
export { simulatePerpClose, executePerpClose } from "./use-cases/close.js";
export { simulatePerpCloseTool, executePerpCloseTool } from "./tools/close-tools.js";
export { getPosition } from "./use-cases/get-position.js";
export { listPositions } from "./use-cases/list-positions.js";
export { getPositionTool } from "./tools/get-position.js";

import { simulatePerpCloseTool, executePerpCloseTool } from "./tools/close-tools.js";
import {
  simulatePerpDepositTool,
  executePerpDepositTool,
  simulatePerpWithdrawalTool,
  executePerpWithdrawalTool,
} from "./tools/collateral-tools.js";
import { getPositionTool } from "./tools/get-position.js";
import {
  getOnboardingStatusTool,
  simulateOnboardTraderTool,
  executeOnboardTraderTool,
} from "./tools/onboarding-tools.js";
import { simulatePerpOpenTool, executePerpOpenTool } from "./tools/open-tools.js";

/** @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>} */
export const perpTools = [
  getPositionTool,
  getOnboardingStatusTool,
  simulateOnboardTraderTool,
  executeOnboardTraderTool,
  simulatePerpDepositTool,
  executePerpDepositTool,
  simulatePerpWithdrawalTool,
  executePerpWithdrawalTool,
  simulatePerpOpenTool,
  executePerpOpenTool,
  simulatePerpCloseTool,
  executePerpCloseTool,
];
