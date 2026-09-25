// @ts-check
/** @typedef {import("./domain/errors.js").LaunchCurveError} LaunchCurveError */
/** @typedef {import("./domain/errors.js").LaunchBuyError} LaunchBuyError */
/** @typedef {import("./domain/types.js").LaunchCurve} LaunchCurve */
/** @typedef {import("./domain/types.js").GetCurveInput} GetCurveInput */
/** @typedef {import("./domain/types.js").LaunchBuyInput} LaunchBuyInput */
/** @typedef {import("./domain/types.js").LaunchExecuteBuyInput} LaunchExecuteBuyInput */
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
} from "./domain/types.js";
export { progressBps } from "./domain/progress.js";
export { LaunchVenue } from "./ports/launch-venue.js";
export { getCurve } from "./use-cases/get-curve.js";
export { executeBuy } from "./use-cases/execute-buy.js";
export { simulateBuy } from "./use-cases/simulate-buy.js";
export { WSOL_MINT } from "./use-cases/to-buy-action.js";
export { getCurveTool } from "./tools/get-curve.js";
export { executeBuyTool } from "./tools/execute-buy.js";
export { simulateBuyTool } from "./tools/simulate-buy.js";

import { executeBuyTool } from "./tools/execute-buy.js";
import { getCurveTool } from "./tools/get-curve.js";
import { simulateBuyTool } from "./tools/simulate-buy.js";

/**
 * The launch slice's public verbs: curve state, and a bounded SOL-in buy on a live curve.
 * There is deliberately no sell tool — an operator needs a checked external exit route before
 * buying here.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const launchTools = [getCurveTool, simulateBuyTool, executeBuyTool];
