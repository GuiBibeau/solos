// @ts-check
/** @typedef {import("./domain/errors.js").LaunchCurveError} LaunchCurveError */
/** @typedef {import("./domain/types.js").LaunchCurve} LaunchCurve */
/** @typedef {import("./domain/types.js").GetCurveInput} GetCurveInput */
export {
  CurveConfigUnavailable,
  CurveCorrupt,
  CurveInputInvalid,
  CurveUnavailable,
  UnsupportedQuoteAsset,
} from "./domain/errors.js";
export { GetCurveInputSchema, LaunchCurveSchema } from "./domain/types.js";
export { progressBps } from "./domain/progress.js";
export { LaunchVenue } from "./ports/launch-venue.js";
export { getCurve } from "./use-cases/get-curve.js";
export { getCurveTool } from "./tools/get-curve.js";

import { getCurveTool } from "./tools/get-curve.js";

/**
 * The launch slice's public verbs. Read-only today: curve state only, no buying, selling, or
 * migration tracking.
 * @type {ReadonlyArray<import("../shared/tools/define-tool.js").AnyToolDefinition>}
 */
export const launchTools = [getCurveTool];
