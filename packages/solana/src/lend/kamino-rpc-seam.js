// @ts-check
/**
 * The one seam between this package's `@solana/kit` and the Kamino klend-sdk: the only file
 * in the slice that touches SDK values or casts. The SDK declares `@solana/kit ^2.3.0` and
 * this repo pins 8.3.0, so Bun resolves a nested 2.x copy for the SDK; both majors speak the
 * same JSON-RPC surface, and `Address` values are plain base58 strings at runtime in both,
 * so the repo's RPC instance satisfies the SDK structurally. The integration fixtures
 * execute this seam end to end on every run, which makes that invariant a checked fact
 * rather than a hope.
 *
 * Methods `KaminoMarket.load` and `getCurrentLedgerInstant` call, all present on kit 8's
 * `SolanaRpcApi`: `getAccountInfo`, `getMultipleAccounts`, `getProgramAccounts`, `getSlot`,
 * `getBlockTime`, `getMinimumBalanceForRentExemption`, `getTokenAccountBalance`, `getBalance`.
 * If a future kit major ever broke that shape, the fix is a passthrough object built here —
 * still one endpoint, one stack, no second RPC client.
 */
/** @type {Promise<typeof import("@kamino-finance/klend-sdk")> | undefined} */
let sdkPromise;

/** Load the large protocol SDK only for an actual lend read, not every CLI/MCP process. */
const kaminoSdk = () => {
  sdkPromise ??= import("@kamino-finance/klend-sdk");
  return sdkPromise;
};

/** The SDK's market type, for the reader's signatures. */
/** @typedef {import("@kamino-finance/klend-sdk").KaminoMarket} KaminoMarketInstance */
/** @typedef {import("@kamino-finance/klend-sdk").KaminoReserve} KaminoReserveInstance */
/** Both fields are bigints — exactly what the SDK's v12 rate methods take. */
/** @typedef {{ readonly slot: bigint; readonly blockTime: bigint }} LedgerInstant */
/** The exact base-unit availability, BN in the SDK's state, mapped by `toString` only. */
/** @typedef {{ readonly toString: () => string }} ExactAmount */
const KLEND_PROGRAM = "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD";

/** Internal sentinels let the adapter classify account failures without parsing SDK text. */
export class KaminoMarketOwnerError extends Error {}
export class KaminoAccountLayoutError extends Error {}

/**
 * Fetch and decode the configured market explicitly before the SDK loads its reserves. The
 * SDK's reserve query filters by exact size and discriminator, so malformed reserve layouts
 * are excluded server-side; this check covers the unfiltered market account.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @param {string} marketAddress
 * @param {typeof import("@kamino-finance/klend-sdk")} sdk
 */
const validateMarketAccount = async (rpc, marketAddress, sdk) => {
  const response = await rpc
    .getAccountInfo(/** @type {any} */ (marketAddress), { encoding: "base64" })
    .send();
  if (response.value === null) return false;
  if (response.value.owner !== KLEND_PROGRAM) throw new KaminoMarketOwnerError();
  try {
    sdk.LendingMarket.decode(Buffer.from(response.value.data[0], "base64"));
  } catch {
    throw new KaminoAccountLayoutError();
  }
  return true;
};

/**
 * Pass this package's kit-8 RPC to klend-sdk code typed against its own kit major, and load
 * the configured market under the pinned program.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @param {string} marketAddress
 * @returns {Promise<KaminoMarketInstance | null>} null when the market account is missing
 */
export const sdkLoadMarket = async (rpc, marketAddress) => {
  const sdk = await kaminoSdk();
  if (!(await validateMarketAccount(rpc, marketAddress, sdk))) return null;
  const { DEFAULT_RECENT_SLOT_DURATION_MS, KaminoMarket } = sdk;
  return KaminoMarket.load(
    /** @type {any} */ (rpc),
    /** @type {any} */ (marketAddress),
    DEFAULT_RECENT_SLOT_DURATION_MS,
    /** @type {any} */ (KLEND_PROGRAM),
  );
};

/**
 * The configured market's float-rate reserve for a mint, or undefined when it has none.
 * @param {KaminoMarketInstance} market
 * @param {string} mint
 * @returns {KaminoReserveInstance | undefined}
 */
export const sdkReserveForMint = (market, mint) =>
  market.getFloatRateReserveByMint(/** @type {any} */ (mint));

/**
 * The reserve identity and availability facts, all as plain values: the reserve address, its
 * underlying liquidity mint, the u64 availability (mapped by `toString` only, never a
 * Number) and the liquidity mint's decimals.
 * @param {KaminoReserveInstance} reserve
 * @returns {{
 *   reserveAddress: string;
 *   liquidityMint: string;
 *   availableAmount: ExactAmount;
 *   decimals: number;
 * }}
 */
export const sdkReserveParts = (reserve) => ({
  reserveAddress: reserve.address.toString(),
  liquidityMint: reserve.getLiquidityMint().toString(),
  availableAmount: reserve.state.liquidity.totalAvailableAmount,
  decimals: reserve.getMintDecimals(),
});

/**
 * The interest-only APY pair from the reserve's own state math; incentive rewards are
 * excluded by the SDK's documented contract.
 * @param {KaminoReserveInstance} reserve
 * @param {LedgerInstant} instant
 * @returns {{ supplyApy: number; borrowApy: number }}
 */
export const sdkReserveRates = (reserve, instant) => ({
  supplyApy: reserve.totalSupplyAPY(/** @type {any} */ (instant)),
  borrowApy: reserve.totalBorrowAPY(/** @type {any} */ (instant)),
});

/**
 * The ledger instant (slot and block time together) the SDK's v12 rate methods require.
 * @param {import("@solana/kit").Rpc<import("@solana/kit").SolanaRpcApi>} rpc
 * @returns {Promise<LedgerInstant>}
 */
export const sdkLedgerInstant = async (rpc) => {
  const { getCurrentLedgerInstant } = await kaminoSdk();
  return getCurrentLedgerInstant(/** @type {any} */ (rpc), "confirmed");
};
