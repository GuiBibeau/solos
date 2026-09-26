// @ts-check
/**
 * The two Raydium CLMM liquidity instructions, encoded from the pinned IDL.
 *
 * Always the `_v2` forms: v1 cannot handle Token-2022 vaults or transfer fees at all, and is
 * marked deprecated upstream.
 *
 * The account orders differ between the two in a way that is easy to miss — `pool_state` is
 * index 2 on increase and index 3 on decrease, `personal_position` index 4 and index 2. The wire
 * test pins both independently for that reason.
 */
import { address, getU64Encoder } from "@solana/kit";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";

const u64 = getU64Encoder();

/** `increase_liquidity_v2`, from the IDL at the pinned commit. */
export const INCREASE_LIQUIDITY_V2_DISCRIMINATOR = Object.freeze([
  133, 29, 89, 223, 69, 238, 176, 10,
]);

/** `decrease_liquidity_v2`, from the IDL at the pinned commit. */
export const DECREASE_LIQUIDITY_V2_DISCRIMINATOR = Object.freeze([
  58, 127, 188, 62, 79, 82, 196, 96,
]);

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
/** Address-checked and mandatory on `decrease_liquidity_v2`, even though its memo call is
 * currently commented out upstream. */
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** @param {bigint} value @returns {Uint8Array} u128 little-endian */
const u128 = (value) => {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt.asUintN(64, value), true);
  view.setBigUint64(8, value >> 64n, true);
  return bytes;
};

/** @param {...(Uint8Array | import("@solana/kit").ReadonlyUint8Array | readonly number[])} parts */
const concat = (...parts) => {
  const flat = parts.flatMap((part) => [...part]);
  return Uint8Array.from(flat);
};

/**
 * `liquidity u128, amount_0_max u64, amount_1_max u64, base_flag Option<bool>`.
 * We always compute our own liquidity, so `base_flag` is always `None` — a single zero byte.
 * @param {{ liquidity: bigint; amount0Max: bigint; amount1Max: bigint }} args
 */
export const increaseLiquidityV2Data = ({ liquidity, amount0Max, amount1Max }) =>
  concat(
    INCREASE_LIQUIDITY_V2_DISCRIMINATOR,
    u128(liquidity),
    u64.encode(amount0Max),
    u64.encode(amount1Max),
    [0],
  );

/**
 * `liquidity u128, amount_0_min u64, amount_1_min u64`. No option byte on this one.
 * @param {{ liquidity: bigint; amount0Min: bigint; amount1Min: bigint }} args
 */
export const decreaseLiquidityV2Data = ({ liquidity, amount0Min, amount1Min }) =>
  concat(
    DECREASE_LIQUIDITY_V2_DISCRIMINATOR,
    u128(liquidity),
    u64.encode(amount0Min),
    u64.encode(amount1Min),
  );

/** Kit's AccountRole numbering: writable and signer are independent bits. */
/** @param {{ writable?: boolean; signer?: boolean }} account */
const roleOf = ({ writable = false, signer = false }) => (writable ? 1 : 0) + (signer ? 2 : 0);

/** @param {string} key */
const ro = (key) => ({ address: address(key), role: roleOf({}) });
/** @param {string} key */
const rw = (key) => ({ address: address(key), role: roleOf({ writable: true }) });

/**
 * @typedef {{
 *   nftOwner: string; nftAccount: string; poolState: string; protocolPosition: string;
 *   personalPosition: string; tickArrayLower: string; tickArrayUpper: string;
 *   tokenAccount0: string; tokenAccount1: string; tokenVault0: string; tokenVault1: string;
 *   vault0Mint: string; vault1Mint: string; bitmapExtension?: string;
 * }} RaydiumLiquidityAccounts
 */

/**
 * `increase_liquidity_v2`: 15 named accounts, then the bitmap extension as `remaining[0]` when
 * the position's arrays fall outside the default bitmap. On increase the program reads that
 * extension positionally — if it is needed and absent, the program panics on a raw slice index
 * rather than erroring cleanly, so the caller must get the decision right.
 * @param {RaydiumLiquidityAccounts} a
 */
export const increaseLiquidityV2Accounts = (a) => [
  { address: address(a.nftOwner), role: roleOf({ signer: true }) },
  ro(a.nftAccount),
  rw(a.poolState),
  ro(a.protocolPosition),
  rw(a.personalPosition),
  rw(a.tickArrayLower),
  rw(a.tickArrayUpper),
  rw(a.tokenAccount0),
  rw(a.tokenAccount1),
  rw(a.tokenVault0),
  rw(a.tokenVault1),
  ro(TOKEN_PROGRAM),
  ro(TOKEN_2022_PROGRAM),
  ro(a.vault0Mint),
  ro(a.vault1Mint),
  ...(a.bitmapExtension === undefined ? [] : [rw(a.bitmapExtension)]),
];

/**
 * `decrease_liquidity_v2`: 16 named accounts. Note `personal_position` and `pool_state` are
 * swapped relative to increase. Reward groups, when the pool has initialized rewards, follow the
 * bitmap extension in the remaining accounts.
 * @param {RaydiumLiquidityAccounts} a
 * @param {ReadonlyArray<{ vault: string; recipient: string; mint: string }>} [rewards]
 */
export const decreaseLiquidityV2Accounts = (a, rewards = []) => [
  { address: address(a.nftOwner), role: roleOf({ signer: true }) },
  ro(a.nftAccount),
  rw(a.personalPosition),
  rw(a.poolState),
  ro(a.protocolPosition),
  rw(a.tokenVault0),
  rw(a.tokenVault1),
  rw(a.tickArrayLower),
  rw(a.tickArrayUpper),
  rw(a.tokenAccount0),
  rw(a.tokenAccount1),
  ro(TOKEN_PROGRAM),
  ro(TOKEN_2022_PROGRAM),
  ro(MEMO_PROGRAM),
  ro(a.vault0Mint),
  ro(a.vault1Mint),
  ...(a.bitmapExtension === undefined ? [] : [rw(a.bitmapExtension)]),
  ...rewards.flatMap((reward) => [rw(reward.vault), rw(reward.recipient), ro(reward.mint)]),
];

/** @param {ReturnType<typeof increaseLiquidityV2Accounts>} accounts @param {Uint8Array} data */
export const raydiumInstruction = (accounts, data) => ({
  programAddress: address(RAYDIUM_CLMM_PROGRAM),
  accounts,
  data,
});
