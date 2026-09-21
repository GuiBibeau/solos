// @ts-check
/**
 * The pinned Orca Whirlpools program, from the official generated IDL artifact. Byte layouts
 * and discriminators were verified against this exact artifact revision, not doc examples:
 * https://cdn.jsdelivr.net/npm/@orca-so/whirlpools-sdk@0.22.0/dist/artifacts/whirlpool.json
 * (metadata `whirlpool 0.9.0`, `address` below). The Rust layout tests in
 * `programs/whirlpool/src/state/{position,whirlpool}.rs` pin the same offsets.
 */

/** Orca Whirlpools program, the IDL `address` field at the pinned artifact. */
export const WHIRLPOOL_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

/** Immutable source pin of the IDL the byte layouts and discriminators were verified against. */
export const WHIRLPOOL_IDL_ARTIFACT =
  "@orca-so/whirlpools-sdk@0.22.0/dist/artifacts/whirlpool.json";

/** 8-byte Anchor discriminator of `account:Position` (IDL `accounts` entry, pinned artifact). */
export const POSITION_DISCRIMINATOR = Object.freeze([170, 188, 143, 228, 122, 64, 247, 208]);

/** 8-byte Anchor discriminator of `account:Whirlpool` (IDL `accounts` entry, pinned artifact). */
export const WHIRLPOOL_DISCRIMINATOR = Object.freeze([63, 149, 209, 12, 225, 128, 99, 9]);

/** Exact on-chain size of a Position account: 8 discriminator + 136 body + 3x24 rewards. */
export const POSITION_BYTES = 216;

/** Exact on-chain size of a Whirlpool account: 8 discriminator + 261 body + 3x128 rewards. */
export const WHIRLPOOL_BYTES = 653;

/** PDA seed of the per-mint position account: ["position", position mint bytes]. */
export const POSITION_SEED = "position";

/** Protocol tick bounds (`MIN_TICK_INDEX`/`MAX_TICK_INDEX`, state/tick.rs). */
export const MIN_TICK_INDEX = -443_636;
export const MAX_TICK_INDEX = 443_636;

/** Absolute offsets of the Position fields solOS reads, in IDL field order. */
export const POSITION_OFFSETS = Object.freeze({
  whirlpool: 8,
  positionMint: 40,
  liquidity: 72,
  tickLowerIndex: 88,
  tickUpperIndex: 92,
});

/** Absolute offsets of the Whirlpool fields solOS reads, in IDL field order. */
export const WHIRLPOOL_OFFSETS = Object.freeze({
  tickSpacing: 41,
  sqrtPrice: 65,
  tokenMintA: 101,
  tokenVaultA: 133,
  tokenMintB: 181,
  tokenVaultB: 213,
});
