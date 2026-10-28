// @ts-check
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { KillSwitchEngaged, StrategyNotFound } from "../domain/errors.js";

/** @param {unknown} error */
export const reasonOf = (error) => {
  if (isTaggedReason(error)) return error.reason ?? "";
  return reasonField(error);
};

/** @param {unknown} error */
export const remedyOf = (error) => {
  if (typeof error === "object" && error !== null && "remedy" in error) {
    return String(/** @type {{ remedy?: unknown }} */ (error).remedy ?? "");
  }
  return "lower the notional or raise the strategy bounds";
};

/** @param {unknown} error @returns {error is { reason?: string }} */
const isTaggedReason = (error) =>
  error instanceof BoundsExceeded ||
  error instanceof KillSwitchEngaged ||
  error instanceof StrategyNotFound;

/** @param {unknown} error */
const reasonField = (error) => {
  if (typeof error === "object" && error !== null && "reason" in error) {
    return String(/** @type {{ reason?: unknown }} */ (error).reason ?? "");
  }
  return "";
};
