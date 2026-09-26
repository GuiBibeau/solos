// @ts-check
/**
 * Pure decoders for the two Raydium CLMM accounts a position read needs. Same discipline as the
 * Whirlpool ones next door: exact size where the layout is fixed, then the Anchor discriminator,
 * then the field rules. The guards, not the decode, are what turn corrupt state into a typed
 * error instead of a fabricated position.
 *
 * PoolState is checked by *minimum* size rather than exact, because the pinned layout ends in
 * padding whose length has changed upstream before. Everything read sits well inside the prefix.
 */
import {
  address,
  getAddressEncoder,
  getBase58Decoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
} from "@solana/kit";
import {
  MAX_TICK_INDEX,
  MIN_TICK_INDEX,
  PERSONAL_POSITION_BYTES,
  PERSONAL_POSITION_DISCRIMINATOR,
  PERSONAL_POSITION_OFFSETS,
  POOL_STATE_DISCRIMINATOR,
  POOL_STATE_OFFSETS,
  POSITION_SEED,
  REWARD_INFO_BYTES,
  REWARD_INFO_COUNT,
  REWARD_INFO_OFFSETS,
  RAYDIUM_CLMM_PROGRAM,
} from "./raydium-clmm-program.js";

const base58 = getBase58Decoder();
const utf8 = getUtf8Encoder();

/** The last byte a pool read touches, so a shorter account is refused before decoding. */
const POOL_STATE_MIN_BYTES = POOL_STATE_OFFSETS.rewardInfos + REWARD_INFO_BYTES * REWARD_INFO_COUNT;

/** @typedef {{ readonly poolId: string; readonly nftMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number }} RaydiumPositionLayout */
/** @typedef {{ readonly sqrtPrice: bigint; readonly tokenMint0: string; readonly tokenMint1: string; readonly tokenVault0: string; readonly tokenVault1: string; readonly decimals0: number; readonly decimals1: number; readonly tickSpacing: number; readonly tickCurrent: number; readonly rewards: ReadonlyArray<{ readonly mint: string; readonly vault: string }> }} RaydiumPoolLayout */
/** @typedef {{ readonly status: "decoded"; readonly layout: RaydiumPositionLayout } | { readonly status: "corrupt"; readonly reason: string }} RaydiumPositionRead */
/** @typedef {{ readonly status: "decoded"; readonly layout: RaydiumPoolLayout } | { readonly status: "corrupt"; readonly reason: string }} RaydiumPoolRead */

/**
 * Position PDA: seeds ["position", nft mint bytes] under the pinned program. Pure, no RPC.
 * @param {string} nftMint @returns {Promise<string>}
 */
export const personalPositionAddress = (nftMint) =>
  getProgramDerivedAddress({
    programAddress: address(RAYDIUM_CLMM_PROGRAM),
    seeds: [
      utf8.encode(POSITION_SEED),
      new Uint8Array(getAddressEncoder().encode(address(nftMint))),
    ],
  }).then(([pda]) => pda);

/** @param {Uint8Array} bytes @param {readonly number[]} discriminator */
const hasDiscriminator = (bytes, discriminator) =>
  discriminator.every((expected, index) => bytes[index] === expected);

/** @param {DataView} view @param {number} offset @returns {bigint} u128 little-endian */
const readU128 = (view, offset) =>
  view.getBigUint64(offset, true) | (view.getBigUint64(offset + 8, true) << 64n);

/** @param {Uint8Array} bytes @param {number} offset */
const readAddress = (bytes, offset) => base58.decode(bytes.slice(offset, offset + 32));

/**
 * The pool's initialized rewards, in reward index order — the order `decrease_liquidity_v2`
 * requires its remaining-account groups to be in. A zero state is an unused slot.
 * @param {Uint8Array} bytes
 */
const initializedRewards = (bytes) =>
  Array.from({ length: REWARD_INFO_COUNT }, (_unused, index) => {
    const at = POOL_STATE_OFFSETS.rewardInfos + REWARD_INFO_BYTES * index;
    return {
      state: bytes[at + REWARD_INFO_OFFSETS.state] ?? 0,
      mint: readAddress(bytes, at + REWARD_INFO_OFFSETS.mint),
      vault: readAddress(bytes, at + REWARD_INFO_OFFSETS.vault),
    };
  })
    .filter((reward) => reward.state !== 0)
    .map(({ mint, vault }) => ({ mint, vault }));

/** @param {string} reason @returns {{ readonly status: "corrupt"; readonly reason: string }} */
const corrupt = (reason) => ({ status: "corrupt", reason });

/**
 * Guard and decode one PersonalPositionState: exact size, the discriminator, and a tick range
 * inside the protocol bounds with lower strictly below upper.
 * @param {Uint8Array | null} bytes @returns {RaydiumPositionRead}
 */
export const decodePersonalPosition = (bytes) => {
  if (bytes === null) return corrupt("no account at the position address");
  if (bytes.length !== PERSONAL_POSITION_BYTES) {
    return corrupt("position account has the wrong layout");
  }
  if (!hasDiscriminator(bytes, PERSONAL_POSITION_DISCRIMINATOR)) {
    return corrupt("position data does not carry the PersonalPositionState discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tickLowerIndex = view.getInt32(PERSONAL_POSITION_OFFSETS.tickLowerIndex, true);
  const tickUpperIndex = view.getInt32(PERSONAL_POSITION_OFFSETS.tickUpperIndex, true);
  if (tickLowerIndex < MIN_TICK_INDEX || tickUpperIndex > MAX_TICK_INDEX) {
    return corrupt("position tick range is outside the protocol tick bounds");
  }
  if (tickLowerIndex >= tickUpperIndex) return corrupt("position tick range is inverted");
  return {
    status: "decoded",
    layout: {
      poolId: readAddress(bytes, PERSONAL_POSITION_OFFSETS.poolId),
      nftMint: readAddress(bytes, PERSONAL_POSITION_OFFSETS.nftMint),
      liquidity: readU128(view, PERSONAL_POSITION_OFFSETS.liquidity),
      tickLowerIndex,
      tickUpperIndex,
    },
  };
};

/**
 * Guard and decode one PoolState. Both mint decimals come from the pool, so a position read
 * needs no separate mint fetch.
 * @param {Uint8Array | null} bytes @returns {RaydiumPoolRead}
 */
export const decodePoolState = (bytes) => {
  if (bytes === null) return corrupt("referenced pool is missing");
  if (bytes.length < POOL_STATE_MIN_BYTES) return corrupt("referenced pool has the wrong layout");
  if (!hasDiscriminator(bytes, POOL_STATE_DISCRIMINATOR)) {
    return corrupt("referenced pool does not carry the PoolState discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    status: "decoded",
    layout: {
      sqrtPrice: readU128(view, POOL_STATE_OFFSETS.sqrtPriceX64),
      tokenMint0: readAddress(bytes, POOL_STATE_OFFSETS.tokenMint0),
      tokenMint1: readAddress(bytes, POOL_STATE_OFFSETS.tokenMint1),
      tokenVault0: readAddress(bytes, POOL_STATE_OFFSETS.tokenVault0),
      tokenVault1: readAddress(bytes, POOL_STATE_OFFSETS.tokenVault1),
      decimals0: bytes[POOL_STATE_OFFSETS.mintDecimals0] ?? 0,
      decimals1: bytes[POOL_STATE_OFFSETS.mintDecimals1] ?? 0,
      tickSpacing: view.getUint16(POOL_STATE_OFFSETS.tickSpacing, true),
      tickCurrent: view.getInt32(POOL_STATE_OFFSETS.tickCurrent, true),
      rewards: initializedRewards(bytes),
    },
  };
};
