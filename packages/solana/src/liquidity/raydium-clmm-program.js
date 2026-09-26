// @ts-check
/**
 * The pinned Raydium CLMM program.
 *
 * **There is nothing versioned to pin to.** `raydium-io/raydium-clmm` publishes no git tags and
 * no releases, the IDL's `metadata.version` is a placeholder `"0.1.0"`, and the program has no
 * on-chain Anchor IDL account to fetch. The deployed mainnet binary is not byte-verifiable
 * against any commit — it was deployed 2026-08-14, between two master commits. So this pins a
 * commit hash and the layouts below were reconciled against live mainnet accounts rather than
 * trusted from a published artifact. That is weaker than the Orca pin next door, which names an
 * exact npm artifact revision, and it is why the decode tests assert against real account bytes.
 *
 * Every offset below was read back from live mainnet pool
 * `3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv` on 2026-09-25 and decoded to sensible values:
 * the mints are wSOL and USDC, the decimals 9 and 6, and the price agrees with the Orca SOL/USDC
 * pool to within 1.6% — two independent venues, which is a stronger check than either alone.
 *
 * Source: https://github.com/raydium-io/raydium-clmm/tree/ed7c84a54ced59c55981780546adb0b4583dcf85
 */

/** Raydium CLMM program on mainnet, the `declare_id!` at the pinned commit. */
export const RAYDIUM_CLMM_PROGRAM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

/**
 * Devnet id, behind the `devnet` cargo feature. Recorded because the widely-cited
 * `devi51mZmdwUJGU9hjN27vEz64Gps7uUefqxg27EAtH` is historical and no longer what the source
 * declares; nothing in solOS uses devnet, and the RPC URL is the only network switch.
 */
export const RAYDIUM_CLMM_DEVNET_PROGRAM = "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH";

/** Immutable source pin the byte layouts and discriminators were verified against. */
export const RAYDIUM_CLMM_COMMIT = "ed7c84a54ced59c55981780546adb0b4583dcf85";

/** 8-byte Anchor discriminator of `account:PersonalPositionState`. */
export const PERSONAL_POSITION_DISCRIMINATOR = Object.freeze([70, 111, 150, 126, 230, 15, 25, 117]);

/** 8-byte Anchor discriminator of `account:PoolState`. */
export const POOL_STATE_DISCRIMINATOR = Object.freeze([247, 237, 227, 245, 215, 195, 222, 70]);

/** Exact on-chain size of a PersonalPositionState account. */
export const PERSONAL_POSITION_BYTES = 281;

/** PDA seed of the per-NFT position account: ["position", nft mint bytes]. */
export const POSITION_SEED = "position";

/** Protocol tick bounds (`tick_math::MIN_TICK`/`MAX_TICK`). */
export const MIN_TICK_INDEX = -443_636;
export const MAX_TICK_INDEX = 443_636;

/** Absolute offsets of the PersonalPositionState fields solOS reads. */
export const PERSONAL_POSITION_OFFSETS = Object.freeze({
  nftMint: 9,
  poolId: 41,
  tickLowerIndex: 73,
  tickUpperIndex: 77,
  liquidity: 81,
});

/**
 * Absolute offsets of the PoolState fields solOS reads. Unlike Orca, the pool carries both mint
 * decimals directly, so a position read needs no separate mint fetch.
 */
export const POOL_STATE_OFFSETS = Object.freeze({
  tokenMint0: 73,
  tokenMint1: 105,
  tokenVault0: 137,
  tokenVault1: 169,
  mintDecimals0: 233,
  mintDecimals1: 234,
  tickSpacing: 235,
  sqrtPriceX64: 253,
  tickCurrent: 269,
  rewardInfos: 397,
});

/**
 * One `RewardInfo` in `PoolState.reward_infos`, and the fields a removal needs from it.
 *
 * A pool with any initialized reward requires exactly three remaining accounts per reward on
 * `decrease_liquidity_v2`; passing none fails the removal outright, even when only liquidity was
 * wanted. Verified against pool `3ucNos4...`, whose reward 0 is RAY with vault `HsBUudV9...`.
 */
export const REWARD_INFO_BYTES = 169;
export const REWARD_INFO_COUNT = 3;
export const REWARD_INFO_OFFSETS = Object.freeze({ state: 0, mint: 57, vault: 89 });
