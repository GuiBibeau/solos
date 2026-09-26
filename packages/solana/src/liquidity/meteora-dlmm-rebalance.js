// @ts-check
/**
 * `rebalance_liquidity` from the pinned IDL (`lb_clmm` 0.12.0, commit 576919e3).
 *
 * Remove-only: `adds` is empty, `shrink_mode` is `NoShrinkBoth` (SDK enum 3, preserve
 * both edges), and both claim flags are false. Fee and reward receipts are a follow-up;
 * encoding a claim here would make the quoted principal dishonest. `min_withdraw_x/y`
 * are the on-chain receipt floors. `max_deposit_*` stay zero because nothing is added.
 * Bin arrays follow the named accounts, writable. An empty remaining-accounts list
 * leaves Token-2022 transfer hooks off, matching the deposit path.
 */
import { address, getU64Encoder } from "@solana/kit";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const u64 = getU64Encoder();

/** `rebalance_liquidity`, from the IDL at the pinned commit. */
export const REBALANCE_LIQUIDITY_DISCRIMINATOR = Object.freeze([92, 4, 176, 193, 119, 185, 83, 9]);

/** SDK `ShrinkMode.NoShrinkBoth` at the pinned commit. Preserve both range edges. */
export const SHRINK_NO_SHRINK_BOTH = 3;

/** Memo program the IDL pins on `rebalance_liquidity`. */
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** System program the IDL pins as `system_program`. */
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** @param {number} value */
const u32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

/** @param {number} value */
const u16 = (value) => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

/** @param {number} value */
const i32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
};

/** @param {number} value */
const u8 = (value) => Uint8Array.of(value);

/** @param {...(Uint8Array | import("@solana/kit").ReadonlyUint8Array | readonly number[])} parts */
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

/** @typedef {{ readonly binId: number; readonly bps: number }} RemoveBin */
/**
 * @typedef {{
 *   activeId: number; maxActiveBinSlippage: number;
 *   minWithdrawX: bigint; minWithdrawY: bigint; removes: readonly RemoveBin[];
 * }} RebalanceArgs
 */

/** One `RemoveLiquidityParams`: both bin ids set, then bps, then 16 zero padding bytes. */
const removeParam = (/** @type {RemoveBin} */ bin) =>
  concat(u8(1), i32(bin.binId), u8(1), i32(bin.binId), u16(bin.bps), new Uint8Array(16));

/**
 * Header through the shrink padding. Claim flags are the two zero bytes after the
 * bin slippage. Both deposit caps are zero: this call does not add liquidity.
 * @param {RebalanceArgs} params
 */
const rebalanceHeader = (params) =>
  concat(
    REBALANCE_LIQUIDITY_DISCRIMINATOR,
    i32(params.activeId),
    u16(params.maxActiveBinSlippage),
    u8(0),
    u8(0),
    u64.encode(params.minWithdrawX),
    u64.encode(0n),
    u64.encode(params.minWithdrawY),
    u64.encode(0n),
    u8(SHRINK_NO_SHRINK_BOTH),
    new Uint8Array(31),
  );

/**
 * Params, then an empty `RemainingAccountsInfo`. `adds` is an empty vec.
 * @param {RebalanceArgs} params
 */
export const rebalanceLiquidityData = (params) =>
  concat(
    rebalanceHeader(params),
    u32(params.removes.length),
    ...params.removes.map(removeParam),
    u32(0),
    u32(0),
  );

/** Kit's AccountRole numbering: writable and signer are independent bits. */
/** @param {{ writable?: boolean; signer?: boolean }} account */
const roleOf = ({ writable = false, signer = false }) => (writable ? 1 : 0) + (signer ? 2 : 0);

/** @param {string} key */
const ro = (key) => ({ address: address(key), role: roleOf({}) });
/** @param {string} key */
const rw = (key) => ({ address: address(key), role: roleOf({ writable: true }) });
/** @param {string} key @param {boolean} writable */
const asSigner = (key, writable) => ({
  address: address(key),
  role: roleOf({ writable, signer: true }),
});

/**
 * @typedef {{
 *   position: string; lbPair: string; bitmapExtension: string;
 *   userTokenX: string; userTokenY: string; reserveX: string; reserveY: string;
 *   tokenXMint: string; tokenYMint: string; owner: string; rentPayer: string;
 *   tokenXProgram: string; tokenYProgram: string; eventAuthority: string;
 *   binArrays: readonly string[];
 * }} RebalanceAccounts
 */

/** The bitmap account is writable only when it is the extension PDA, not the program sentinel. */
const bitmapAccount = (/** @type {string} */ key) =>
  key === METEORA_DLMM_PROGRAM ? ro(key) : rw(key);

/**
 * 17 named accounts in IDL order, then one writable bin array per array the removes touch.
 * `bitmapExtension` is the extension PDA outside the default bitmap, otherwise the program
 * id, which the program treats as absent. That sentinel is read-only.
 * @param {RebalanceAccounts} accounts
 */
export const rebalanceLiquidityAccounts = (accounts) => [
  rw(accounts.position),
  rw(accounts.lbPair),
  bitmapAccount(accounts.bitmapExtension),
  rw(accounts.userTokenX),
  rw(accounts.userTokenY),
  rw(accounts.reserveX),
  rw(accounts.reserveY),
  ro(accounts.tokenXMint),
  ro(accounts.tokenYMint),
  asSigner(accounts.owner, false),
  asSigner(accounts.rentPayer, true),
  ro(accounts.tokenXProgram),
  ro(accounts.tokenYProgram),
  ro(MEMO_PROGRAM),
  ro(SYSTEM_PROGRAM),
  ro(accounts.eventAuthority),
  ro(METEORA_DLMM_PROGRAM),
  ...accounts.binArrays.map((binArray) => rw(binArray)),
];

/** @param {RebalanceAccounts} accounts @param {RebalanceArgs} params */
export const rebalanceLiquidityInstruction = (accounts, params) => ({
  programAddress: address(METEORA_DLMM_PROGRAM),
  accounts: rebalanceLiquidityAccounts(accounts),
  data: rebalanceLiquidityData(params),
});
