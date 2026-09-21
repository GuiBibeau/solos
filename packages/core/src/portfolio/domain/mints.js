// @ts-check

/** Wrapped SOL's mint: the price feed identity for native SOL, itself a wallet position. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** USDC and USDT: the recognized stablecoins held as cash (ADR-0018 starts with USDC). */
export const CASH_MINTS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

/** Deterministic byte-order comparator for address strings. */
/** @param {string} a @param {string} b */
export const compareString = (a, b) => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
