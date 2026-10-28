// @ts-check
import { UnsupportedStrategyAction } from "./errors.js";

const LIQUIDITY = new Set(["remove_liquidity", "close_position", "open_position", "add_liquidity"]);

const SUPPORTED = new Set(["transfer_sol", "swap", ...LIQUIDITY]);

/** A Meteora liquidity action a range tick may reserve. @param {string} type */
export const isLiquidityAction = (type) => LIQUIDITY.has(type);

/**
 * A tick may reserve only these kinds. Anything else is refused at registration and again
 * before a tick quotes or sends.
 * @param {string} type
 * @returns {UnsupportedStrategyAction | undefined}
 */
export const unsupportedStrategyAction = (type) => {
  if (SUPPORTED.has(type)) return undefined;
  return new UnsupportedStrategyAction({ type });
};
