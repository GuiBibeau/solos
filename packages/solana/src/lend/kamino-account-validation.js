// @ts-check
const KLEND_PROGRAM = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";
const MARKET_OFFSET = 32n;
const LIQUIDITY_MINT_OFFSET = 128n;

/** Account owner differs from the pinned Kamino lending program. */
export class KaminoMarketOwnerError extends Error {}

/** Account bytes differ from the pinned Kamino account layout. */
export class KaminoAccountLayoutError extends Error {
  /** @param {string} account */
  constructor(account) {
    super("Kamino account layout is unsupported");
    this.account = account;
  }
}

/**
 * Decode the configured market before the SDK performs its filtered reserve query.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @param {string} market
 * @param {typeof import("@kamino-finance/klend-sdk")} sdk
 */
export const validateMarketAccount = async (rpc, market, sdk) => {
  const response = await rpc
    .getAccountInfo(/** @type {any} */ (market), { encoding: "base64" })
    .send();
  if (response.value === null) return false;
  if (response.value.owner !== KLEND_PROGRAM) throw new KaminoMarketOwnerError();
  try {
    sdk.LendingMarket.decode(Buffer.from(response.value.data[0], "base64"));
  } catch {
    throw new KaminoAccountLayoutError(market);
  }
  return true;
};

/**
 * Find a reserve candidate by the stable market and liquidity-mint fields without the
 * SDK's size or discriminator filters, then decode it under the pinned layout.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @param {{ readonly market: string; readonly mint: string }} target
 * @param {typeof import("@kamino-finance/klend-sdk")} sdk
 */
export const validateReserveCandidates = async (rpc, target, sdk) => {
  const candidates = /** @type {any[]} */ (
    /** @type {any} */ (
      await rpc
        .getProgramAccounts(/** @type {any} */ (KLEND_PROGRAM), {
          encoding: "base64",
          filters: [
            {
              memcmp: {
                offset: MARKET_OFFSET,
                bytes: /** @type {any} */ (target.market),
                encoding: "base58",
              },
            },
            {
              memcmp: {
                offset: LIQUIDITY_MINT_OFFSET,
                bytes: /** @type {any} */ (target.mint),
                encoding: "base58",
              },
            },
          ],
        })
        .send()
    )
  );
  for (const candidate of candidates) {
    try {
      sdk.Reserve.decode(Buffer.from(candidate.account.data[0], "base64"));
    } catch {
      throw new KaminoAccountLayoutError(candidate.pubkey);
    }
  }
};
