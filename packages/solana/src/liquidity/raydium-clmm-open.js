// @ts-check
/**
 * Opening and closing a Raydium CLMM position.
 *
 * solOS never *chooses* a range — that is strategy, and ADR-0006 keeps strategy upstream. It does
 * execute one the caller chose, which is what these two instructions are for. An unaligned range
 * is refused rather than rounded: rounding would be choosing.
 *
 * `open_position_with_token22_nft` is the Token-2022 NFT form, which carries no Metaplex metadata
 * accounts and so is the smaller of the two. Its `position_nft_mint` is a **writable signer** —
 * one solOS path that needs a second, ephemeral keypair beside the fee payer. Meteora's
 * initialize_position is the other: its position account signs, and that key is not an NFT.
 */
import { address, getU64Encoder } from "@solana/kit";
import { ATA_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./raydium-clmm-instruction.js";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";

const u64 = getU64Encoder();

export const OPEN_POSITION_T22_DISCRIMINATOR = Object.freeze([77, 255, 174, 82, 125, 29, 201, 46]);
export const CLOSE_POSITION_DISCRIMINATOR = Object.freeze([123, 134, 81, 0, 49, 68, 98, 98]);

const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** @param {number} value @returns {Uint8Array} i32 little-endian */
const i32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
};

/** @param {bigint} value @returns {Uint8Array} u128 little-endian */
const u128 = (value) => {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, BigInt.asUintN(64, value), true);
  view.setBigUint64(8, value >> 64n, true);
  return bytes;
};

/** @param {...(Uint8Array | import("@solana/kit").ReadonlyUint8Array | readonly number[])} parts */
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

/**
 * `tick_lower, tick_upper, tick_array_lower_start, tick_array_upper_start, liquidity,
 * amount_0_max, amount_1_max, with_metadata, base_flag`.
 *
 * The two array start indices are arguments as well as accounts: the program recomputes them and
 * rejects a mismatch, so an off-by-one in the floor division fails loudly instead of silently
 * touching the wrong array. `with_metadata` is false — the Token-2022 form has no metadata
 * accounts to write to — and `base_flag` is None because the caller's liquidity is already fixed.
 * @param {{ tickLower: number; tickUpper: number; startLower: number; startUpper: number;
 *   liquidity: bigint; amount0Max: bigint; amount1Max: bigint }} args
 */
export const openPositionData = (args) =>
  concat(
    OPEN_POSITION_T22_DISCRIMINATOR,
    i32(args.tickLower),
    i32(args.tickUpper),
    i32(args.startLower),
    i32(args.startUpper),
    u128(args.liquidity),
    u64.encode(args.amount0Max),
    u64.encode(args.amount1Max),
    [0], // with_metadata: false
    [0], // base_flag: None
  );

/** `close_position` takes no arguments; the guards are all on chain. */
export const closePositionData = () => Uint8Array.from(CLOSE_POSITION_DISCRIMINATOR);

/** @param {{ writable?: boolean; signer?: boolean }} account */
const roleOf = ({ writable = false, signer = false }) => (writable ? 1 : 0) + (signer ? 2 : 0);
/** @param {string} key */
const ro = (key) => ({ address: address(key), role: roleOf({}) });
/** @param {string} key */
const rw = (key) => ({ address: address(key), role: roleOf({ writable: true }) });

/**
 * The 20 accounts `open_position_with_token22_nft` lists.
 *
 * Index 0 and index 2 are both signers — the fee payer and the freshly generated NFT mint. Every
 * other solOS instruction has exactly one, so the v1 boundary sees a shape here it sees nowhere
 * else.
 * @param {{ payer: string; nftMint: string; nftAccount: string; poolState: string;
 *   protocolPosition: string; tickArrayLower: string; tickArrayUpper: string;
 *   personalPosition: string; tokenAccount0: string; tokenAccount1: string;
 *   tokenVault0: string; tokenVault1: string; vault0Mint: string; vault1Mint: string }} a
 */
export const openPositionAccounts = (a) => [
  { address: address(a.payer), role: roleOf({ writable: true, signer: true }) },
  ro(a.payer),
  { address: address(a.nftMint), role: roleOf({ writable: true, signer: true }) },
  rw(a.nftAccount),
  rw(a.poolState),
  ro(a.protocolPosition),
  rw(a.tickArrayLower),
  rw(a.tickArrayUpper),
  rw(a.personalPosition),
  rw(a.tokenAccount0),
  rw(a.tokenAccount1),
  rw(a.tokenVault0),
  rw(a.tokenVault1),
  ro(RENT_SYSVAR),
  ro(SYSTEM_PROGRAM),
  ro(TOKEN_PROGRAM),
  ro(ATA_PROGRAM),
  ro(TOKEN_2022_PROGRAM),
  ro(a.vault0Mint),
  ro(a.vault1Mint),
];

/**
 * The 6 accounts `close_position` lists. The program refuses unless liquidity, both
 * `token_fees_owed` and every `reward_amount_owed` are exactly zero, so a real close is always a
 * full removal followed by this.
 *
 * `nftProgram` is the token program that actually owns the NFT mint and its custody account, and
 * it is the caller's job to read it rather than assume it. Raydium's older `open_position_v2`
 * mints a classic SPL NFT and most positions in existence are those; only positions solOS opened
 * itself carry a Token-2022 NFT. Pinning the Token-2022 program here made every legacy position
 * impossible to close, however empty it was.
 * @param {{ nftOwner: string; nftMint: string; nftAccount: string; personalPosition: string;
 *   nftProgram: string }} a
 */
export const closePositionAccounts = (a) => [
  { address: address(a.nftOwner), role: roleOf({ writable: true, signer: true }) },
  rw(a.nftMint),
  rw(a.nftAccount),
  rw(a.personalPosition),
  ro(SYSTEM_PROGRAM),
  ro(a.nftProgram),
];

/** @param {ReturnType<typeof openPositionAccounts>} accounts @param {Uint8Array} data */
export const raydiumOpenInstruction = (accounts, data) => ({
  programAddress: address(RAYDIUM_CLMM_PROGRAM),
  accounts,
  data,
});
