// @ts-check
import { UnsupportedStrategyAction } from "./errors.js";

/**
 * A tick may reserve only these kinds. Anything else is refused at registration and again
 * before a tick quotes or sends.
 * @param {string} type
 * @returns {UnsupportedStrategyAction | undefined}
 */
export const unsupportedStrategyAction = (type) => {
  if (type === "transfer_sol" || type === "swap") return undefined;
  return new UnsupportedStrategyAction({ type });
};
