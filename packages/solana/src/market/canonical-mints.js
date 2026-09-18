// @ts-check

/** @typedef {{ readonly name: string; readonly symbol: string; readonly decimals: number }} CanonicalMint */
/** The part of the mint guards the canonical gate reads. @typedef {{ readonly verdict: "mint"; readonly program: "spl" | "token-2022"; readonly decimals: number }} VerifiedLayout */

/**
 * The two mints every agent asks about first, with their documented names and decimals.
 * Applied only after the chain agreed; never as a lookup table that bypasses verification.
 * @type {ReadonlyMap<string, CanonicalMint>}
 */
const CANONICAL = new Map([
  [
    "So11111111111111111111111111111111111111112",
    { name: "Wrapped SOL", symbol: "wSOL", decimals: 9 },
  ],
  [
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    { name: "USD Coin", symbol: "USDC", decimals: 6 },
  ],
]);

/**
 * Canonical wSOL/USDC mapping. The layout guards already proved the account exists, is
 * initialized, and whose program owns it; this gate additionally demands the classic token
 * program and on-chain decimals equal to the documented ones. A mint seeded with the wrong
 * decimals therefore maps to null and the caller fails with `TokenMetadataUnavailable`
 * instead of inventing a ticker.
 * @param {string} mint
 * @param {VerifiedLayout} layout a layout with `verdict: "mint"`
 * @returns {CanonicalMint | null}
 */
export const canonicalMint = (mint, layout) => {
  const entry = CANONICAL.get(mint);
  if (entry === undefined) return null;
  if (layout.verdict !== "mint" || layout.program !== "spl") return null;
  return layout.decimals === entry.decimals ? entry : null;
};
