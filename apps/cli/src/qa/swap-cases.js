// @ts-check
/**
 * The pairs swap reliability is measured against. Each is a real mainnet market an operator
 * would plausibly trade, chosen to cover the route shapes that behave differently:
 *
 * - `sol-usdc` is the deepest pair and the one Jupiter most often routes through Manifest,
 *   which is what made swaps fail before ADR-0024.
 * - `usdc-sol` exercises the SOL-output side, where the spend bound is two-sided.
 * - `sol-usdt` is a second stable leg with both accounts usually open: fee-only overhead.
 * - `sol-bonk` opens a destination account on many routes, so it carries rent overhead and is
 *   the pair that caught the first allowance being too tight.
 */

export const WSOL = "So11111111111111111111111111111111111111112";
export const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const BONK = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";

/** @typedef {{ name: string; inputMint: string; outputMint: string; scale: "sol" | "usdc" }} SwapPair */

/**
 * `scale` says which side the round's amount is denominated in, so one `--amount-sol` drives
 * every pair: a SOL input spends that amount, a USDC input spends its rough equivalent.
 * @type {ReadonlyArray<SwapPair>}
 */
export const SWAP_PAIRS = [
  { name: "sol-usdc", inputMint: WSOL, outputMint: USDC, scale: "sol" },
  { name: "usdc-sol", inputMint: USDC, outputMint: WSOL, scale: "usdc" },
  { name: "sol-usdt", inputMint: WSOL, outputMint: USDT, scale: "sol" },
  { name: "sol-bonk", inputMint: WSOL, outputMint: BONK, scale: "sol" },
];

/** Rough SOL price in USDC base units, used only to size the token-input leg comparably. */
const USDC_PER_SOL = 113_000_000n;
const LAMPORTS_PER_SOL = 1_000_000_000n;

/**
 * The input amount for one pair, in that mint's base units.
 * @param {SwapPair} pair
 * @param {bigint} lamports the round size, in lamports
 */
export const amountFor = (pair, lamports) =>
  pair.scale === "sol" ? lamports : (lamports * USDC_PER_SOL) / LAMPORTS_PER_SOL;
