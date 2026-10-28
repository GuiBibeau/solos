// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { addDecimal, divDecimalUp, mulDecimal } from "./decimal.js";
import { isLiquidityAction, isPerpAction } from "./supported-action.js";

/**
 * Price and the mint's verified decimals. Callers pass the decimals a mint read returned.
 * @typedef {{ readonly priceUsd: string; readonly decimals: number }} PricedAmount
 */

/**
 * Extra prices a liquidity quote already observed. Fee-only actions ignore them.
 * @typedef {{
 *   readonly feeUsd: string;
 *   readonly valueUsd?: string;
 *   readonly redeposit?: boolean;
 *   readonly priceB?: string;
 *   readonly decimalsB?: number;
 * }} LiquidityPriced
 */

/**
 * Worst-case USD for one Action: input notional at max slippage, plus the fee the built
 * transaction can cost. `feeUsd` is priced with the same SOL read the settle uses.
 * @param {import("@solos-sh/actions").Action} action
 * @param {PricedAmount & { readonly feeUsd: string } & Partial<LiquidityPriced>} priced
 */
export const reserveUsdFor = (action, priced) => {
  if (isPerpAction(action.type)) return addDecimal(perpPrincipal(action), priced.feeUsd);
  if (!isLiquidityAction(action.type)) {
    return addDecimal(slippageUsd(inputUsd(action, priced), slippageBps(action)), priced.feeUsd);
  }
  return addDecimal(liquidityPrincipal(action, priced), priced.feeUsd);
};

/** Input notional in USD, without the slippage or fee buffer. @param {import("@solos-sh/actions").Action} action @param {PricedAmount & Partial<LiquidityPriced>} priced */
export const actualUsdFor = (action, priced) => {
  if (isPerpAction(action.type)) return perpPrincipal(action);
  if (isLiquidityAction(action.type)) return liquidityPrincipal(action, priced);
  return inputUsd(action, priced);
};

/** Mint the reservation is judged against. @param {import("@solos-sh/actions").Action} action */
export const mintOf = (action) => {
  if (action.type === "swap") return action.inputMint;
  return WSOL_MINT;
};

/**
 * Withdrawn principal counts once. A same-tick redeposit, a close, and an open add no USD.
 * @param {import("@solos-sh/actions").Action} action
 * @param {Partial<LiquidityPriced> & Partial<PricedAmount>} priced
 */
const liquidityPrincipal = (action, priced) => {
  if (action.type === "close_position" || action.type === "open_position") return "0";
  if (action.type === "add_liquidity" && priced.redeposit === true) return "0";
  if (action.type === "remove_liquidity") return fractionUsd(priced.valueUsd ?? "0", action.bps);
  if (action.type !== "add_liquidity") return "0";
  return addDecimal(legUsd(action.amountA, priced), legUsd(action.amountB, otherLeg(priced)));
};

/** Open reserves the USD notional. Close reserves none of it. @param {import("@solos-sh/actions").Action} action */
const perpPrincipal = (action) =>
  action.type === "open_perp" ? microUsd(action.notionalUsd) : "0";

/** 1e6 USD units to a decimal USD string. @param {string} micro */
const microUsd = (micro) => {
  if (!/^\d+$/.test(micro)) return "0";
  const digits = BigInt(micro).toString().padStart(7, "0");
  const frac = digits.slice(-6).replace(/0+$/, "");
  const whole = digits.slice(0, -6);
  return frac === "" ? whole : `${whole}.${frac}`;
};

/** @param {string} valueUsd @param {number} bps */
const fractionUsd = (valueUsd, bps) => {
  if (!/^\d+(\.\d+)?$/.test(valueUsd)) return "0";
  return divDecimalUp(mulDecimal(valueUsd, String(bps)), "10000");
};

/**
 * @param {string} amount
 * @param {Partial<PricedAmount>} priced
 */
const legUsd = (amount, priced) => {
  if (priced.priceUsd === undefined || priced.decimals === undefined) return "0";
  if (!/^\d+$/.test(amount) || !/^\d+(\.\d+)?$/.test(priced.priceUsd)) return "0";
  return divDecimalUp(mulDecimal(amount, priced.priceUsd), String(10n ** BigInt(priced.decimals)));
};

/** @param {Partial<LiquidityPriced>} priced @returns {Partial<PricedAmount>} */
const otherLeg = (priced) => ({
  ...(priced.priceB !== undefined && { priceUsd: priced.priceB }),
  ...(priced.decimalsB !== undefined && { decimals: priced.decimalsB }),
});

/** @param {import("@solos-sh/actions").Action} action @param {PricedAmount} priced */
const inputUsd = (action, priced) =>
  divDecimalUp(
    mulDecimal(baseUnits(action), priced.priceUsd),
    String(10n ** BigInt(priced.decimals)),
  );

/** @param {string} notional @param {number} bps */
const slippageUsd = (notional, bps) =>
  divDecimalUp(mulDecimal(notional, String(10_000 + bps)), "10000");

/** @param {import("@solos-sh/actions").Action} action */
const baseUnits = (action) => (action.type === "swap" ? action.amount : lamportsOf(action));

/** @param {import("@solos-sh/actions").Action} action */
const lamportsOf = (action) => (action.type === "transfer_sol" ? action.lamports : "0");

/** @param {import("@solos-sh/actions").Action} action */
const slippageBps = (action) => (action.type === "swap" ? action.maxSlippageBps : 0);
