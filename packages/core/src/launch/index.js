// @ts-check
/** @typedef {import("./domain/errors.js").LaunchCurveError} LaunchCurveError */
/** @typedef {import("./domain/errors.js").LaunchBuyError} LaunchBuyError */
/** @typedef {import("./domain/types.js").LaunchCurve} LaunchCurve */
/** @typedef {import("./domain/types.js").GetCurveInput} GetCurveInput */
/** @typedef {import("./domain/types.js").LaunchBuyInput} LaunchBuyInput */
/** @typedef {import("./domain/types.js").LaunchExecuteBuyInput} LaunchExecuteBuyInput */
/** @typedef {import("./domain/types.js").LaunchSellInput} LaunchSellInput */
/** @typedef {import("./domain/types.js").LaunchExecuteSellInput} LaunchExecuteSellInput */
export {
  CurveComplete,
  CurveConfigUnavailable,
  CurveCorrupt,
  CurveInputInvalid,
  CurveUnavailable,
  UnsupportedQuoteAsset,
} from "./domain/errors.js";
export {
  GetCurveInputSchema,
  LaunchBuyInputSchema,
  LaunchCurveSchema,
  LaunchExecuteBuyInputSchema,
  LaunchExecuteSellInputSchema,
  LaunchSellInputSchema,
} from "./domain/types.js";
export { progressBps } from "./domain/progress.js";
export { LaunchVenue } from "./ports/launch-venue.js";
export { getCurve } from "./use-cases/get-curve.js";
export { executeBuy } from "./use-cases/execute-buy.js";
export { simulateBuy } from "./use-cases/simulate-buy.js";
export { executeSell } from "./use-cases/execute-sell.js";
export { simulateSell } from "./use-cases/simulate-sell.js";
export { WSOL_MINT } from "./use-cases/to-buy-action.js";
export { getCurveTool } from "./tools/get-curve.js";
export { executeBuyTool } from "./tools/execute-buy.js";
export { simulateBuyTool } from "./tools/simulate-buy.js";
export { executeSellTool } from "./tools/execute-sell.js";
export { simulateSellTool } from "./tools/simulate-sell.js";

import { executeBuyTool } from "./tools/execute-buy.js";
import { executeSellTool } from "./tools/execute-sell.js";
import { getCurveTool } from "./tools/get-curve.js";
import { simulateBuyTool } from "./tools/simulate-buy.js";
import { simulateSellTool } from "./tools/simulate-sell.js";

/**
 * The launch slice's public verbs: curve state, a bounded SOL-in buy on a live curve, and the
 * curve-side sell that exits it. Both directions are the same `venue: "pump"` route read in
 * opposite directions, and neither is ever rerouted to another venue.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const launchTools = [
  getCurveTool,
  simulateBuyTool,
  executeBuyTool,
  simulateSellTool,
  executeSellTool,
];
