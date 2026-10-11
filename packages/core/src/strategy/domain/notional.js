// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { addDecimal, divDecimalUp, mulDecimal } from "./decimal.js";

/**
 * Price and the mint's verified decimals. Callers pass the decimals a mint read returned.
 * @typedef {{ readonly priceUsd: string; readonly decimals: number }} PricedAmount
 */

/**
 * Worst-case USD for one Action: input notional at max slippage, plus the fee the built
 * transaction can cost. `feeUsd` is priced with the same SOL read the settle uses.
 * @param {import("@solos-sh/actions").Action} action
 * @param {PricedAmount & { readonly feeUsd: string }} priced
 */
export const reserveUsdFor = (action, priced) =>
  addDecimal(slippageUsd(inputUsd(action, priced), slippageBps(action)), priced.feeUsd);

/** Input notional in USD, without the slippage or fee buffer. @param {import("@solos-sh/actions").Action} action @param {PricedAmount} priced */
export const actualUsdFor = (action, priced) => inputUsd(action, priced);

/** Mint the reservation is judged against. @param {import("@solos-sh/actions").Action} action */
export const mintOf = (action) => {
  if (action.type === "swap") return action.inputMint;
  return WSOL_MINT;
};

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
