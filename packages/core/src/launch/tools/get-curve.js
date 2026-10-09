// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { GetCurveInputSchema } from "../domain/types.js";
import { getCurve } from "../use-cases/get-curve.js";

export const getCurveTool = defineTool({
  name: "solana_launch_get_curve",
  group: "launch",
  tier: "read",
  stability: "beta",
  title: "Get bonding curve state",
  description:
    "Read the current state of a pump.fun bonding curve for one launched token mint: whether " +
    "the curve is complete, its sold progress in basis points (0-10000, floored), and its " +
    "virtual SOL and token reserves as exact base-unit integer strings. progressBps is floored " +
    "to the integer basis point below the exact value. Only SOL-paired curves are supported — " +
    "a curve trading against any other quote asset fails with UnsupportedQuoteAsset. complete " +
    "is the on-chain curve flag only; it does not prove a PumpSwap migration pool exists. " +
    "Read-only: nothing is bought, sold, signed, or sent, and there is no Jupiter fallback.",
  input: GetCurveInputSchema,
  run: getCurve,
});
