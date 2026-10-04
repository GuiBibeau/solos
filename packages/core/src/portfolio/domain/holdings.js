// @ts-check

/** One venue's complete owner enumeration (ADR-0018 shape, shared by lend/perp/liquidity). */
/** @typedef {{ readonly positions: readonly import("@solos-sh/actions").Position[]; readonly perpAccounts: readonly { readonly protocol: string; readonly account: string; readonly equityUsd: string | null }[]; readonly receiptMints: readonly string[] }} VenueEnumeration */
/** @typedef {{ readonly lend: VenueEnumeration; readonly perp: VenueEnumeration; readonly liquidity: VenueEnumeration }} VenueReads */
/** @typedef {{ readonly mint: string; readonly tokenAccount: string; readonly amount: string; readonly decimals: number }} TokenBalanceRecord */
/** @typedef {{ readonly lamports: bigint; readonly tokenBalances: readonly TokenBalanceRecord[]; readonly venues: VenueReads }} WalletReads */

/** First-seen account dedup: a provider quirk may list the same token account twice. */
/** @param {readonly TokenBalanceRecord[]} tokenBalances */
const deduplicated = (tokenBalances) => {
  const seen = new Set();
  return tokenBalances.filter((balance) => {
    if (seen.has(balance.tokenAccount)) return false;
    seen.add(balance.tokenAccount);
    return true;
  });
};

/** Drop zero balances: a closed token account carries no information. */
/** @param {Map<string, { amount: bigint; decimals: number }>} byMint */
const dropZeros = (byMint) => {
  for (const [mint, holding] of byMint) {
    if (holding.amount === 0n) byMint.delete(mint);
  }
  return byMint;
};

/**
 * Wallet token holdings: deduplicated by token account address, summed by mint, receipt mints
 * from the successful venue reads dropped (the position itself is the claim), zero balances
 * omitted.
 * @param {WalletReads} reads
 * @returns {Map<string, { amount: bigint; decimals: number }>}
 */
export const walletHoldings = (reads) => {
  const receiptMints = new Set(
    [reads.venues.lend, reads.venues.perp, reads.venues.liquidity].flatMap(
      (venue) => venue.receiptMints,
    ),
  );
  /** @type {Map<string, { amount: bigint; decimals: number }>} */
  const byMint = new Map();
  for (const balance of deduplicated(reads.tokenBalances)) {
    if (receiptMints.has(balance.mint)) continue;
    const prior = byMint.get(balance.mint);
    byMint.set(balance.mint, {
      amount: (prior?.amount ?? 0n) + BigInt(balance.amount),
      decimals: prior?.decimals ?? balance.decimals,
    });
  }
  return dropZeros(byMint);
};
