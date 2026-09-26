// @ts-check
/**
 * The pinned Meteora DLMM program (`lb_clmm` 0.12.0).
 *
 * Source: https://github.com/MeteoraAg/dlmm-sdk/tree/576919e3e4368e542c402f000b4264724f7f23ec
 * IDL: `idls/dlmm.json` at that commit (`metadata.version` 0.12.0, address below).
 * Discriminators are the IDL account discriminators, which match `sha256("account:<Name>")`.
 *
 * Offsets below are IDL field order plus the 8-byte Anchor discriminator. Read back from
 * mainnet on 2026-09-26: LbPair `5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6` is 904 bytes,
 * discriminator as declared, token X wSOL and token Y USDC at the mint offsets. PositionV2
 * `15uxv5sbm16WmGyAwSaAGRMsSusCuH3fZkMmwLyqG8A` is 8120 bytes with `lb_pair` at 8 and
 * `owner` at 40.
 */

/** Meteora DLMM program on mainnet, the IDL `address` at the pinned commit. */
export const METEORA_DLMM_PROGRAM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";

/** Immutable source pin. ADR-0022 names this revision. */
export const METEORA_DLMM_COMMIT = "576919e3e4368e542c402f000b4264724f7f23ec";

/** 8-byte Anchor discriminator of `account:PositionV2`. */
export const POSITION_V2_DISCRIMINATOR = Object.freeze([117, 176, 212, 199, 245, 180, 133, 182]);

/** 8-byte Anchor discriminator of `account:LbPair`. */
export const LB_PAIR_DISCRIMINATOR = Object.freeze([33, 11, 49, 98, 181, 101, 177, 13]);

/** 8-byte Anchor discriminator of `account:BinArray`. */
export const BIN_ARRAY_DISCRIMINATOR = Object.freeze([92, 142, 92, 220, 5, 148, 70, 181]);

/** Exact on-chain size: 8 discriminator + 8112 PositionV2 body. */
export const POSITION_V2_BYTES = 8120;

/** Exact on-chain size: 8 discriminator + 896 LbPair body. */
export const LB_PAIR_BYTES = 904;

/** Exact on-chain size: 8 discriminator + 10128 BinArray body. */
export const BIN_ARRAY_BYTES = 10_136;

/** One `Bin` inside a BinArray. The element has no discriminator of its own. */
export const BIN_BYTES = 144;

/** IDL `MAX_BIN_PER_ARRAY` and the PositionV2 `liquidity_shares` length. */
export const BINS_PER_ARRAY = 70;

/** PDA seed of a bin array: ["bin_array", lb pair, i64 index]. */
export const BIN_ARRAY_SEED = "bin_array";

/** Absolute offsets of the PositionV2 fields a point read uses. Owner is byte 40. */
export const POSITION_V2_OFFSETS = Object.freeze({
  lbPair: 8,
  owner: 40,
  liquidityShares: 72,
  lowerBinId: 7912,
  upperBinId: 7916,
});

/**
 * Absolute offsets of the LbPair fields a point read uses. Token X then token Y is the IDL
 * mint order and becomes LpPosition token A then token B.
 */
export const LB_PAIR_OFFSETS = Object.freeze({
  activeId: 76,
  binStep: 80,
  tokenMintX: 88,
  tokenMintY: 120,
});

/** Absolute offsets of the BinArray header. Bins begin after it. */
export const BIN_ARRAY_OFFSETS = Object.freeze({
  index: 8,
  lbPair: 24,
  bins: 56,
});

/** Offsets inside one `Bin`. Principal is `amount_x` / `amount_y` over `liquidity_supply`. */
export const BIN_OFFSETS = Object.freeze({
  amountX: 0,
  amountY: 8,
  liquiditySupply: 32,
});
