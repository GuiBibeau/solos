// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { addDecimal, divDecimalUp, mulDecimal } from "./decimal.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Worst-case USD for one Action: input notional at max slippage, plus the fee the built
 * transaction can cost. `feeUsd` is priced with the same SOL read the settle uses.
 * @param {import("@solos-sh/actions").Action} action
 * @param {string} priceUsd
 * @param {string} feeUsd
 */
export const reserveUsdFor = (action, priceUsd, feeUsd) =>
  addDecimal(slippageUsd(inputUsd(action, priceUsd), slippageBps(action)), feeUsd);

/** Input notional in USD, without the slippage or fee buffer. @param {import("@solos-sh/actions").Action} action @param {string} priceUsd */
export const actualUsdFor = (action, priceUsd) => inputUsd(action, priceUsd);

/** Mint the reservation is judged against. @param {import("@solos-sh/actions").Action} action */
export const mintOf = (action) => {
  if (action.type === "swap") return action.inputMint;
  return WSOL_MINT;
};

/** @param {import("@solos-sh/actions").Action} action @param {string} priceUsd */
const inputUsd = (action, priceUsd) =>
  divDecimalUp(mulDecimal(baseUnits(action), priceUsd), String(10n ** BigInt(decimalsOf(action))));

/** @param {string} notional @param {number} bps */
const slippageUsd = (notional, bps) =>
  divDecimalUp(mulDecimal(notional, String(10_000 + bps)), "10000");

/** @param {import("@solos-sh/actions").Action} action */
const baseUnits = (action) => (action.type === "swap" ? action.amount : lamportsOf(action));

/** @param {import("@solos-sh/actions").Action} action */
const lamportsOf = (action) => (action.type === "transfer_sol" ? action.lamports : "0");

/** @param {import("@solos-sh/actions").Action} action */
const slippageBps = (action) => (action.type === "swap" ? action.maxSlippageBps : 0);

/** @param {import("@solos-sh/actions").Action} action */
const decimalsOf = (action) => {
  const mint = mintOf(action);
  if (mint === USDC) return 6;
  return 9;
};
