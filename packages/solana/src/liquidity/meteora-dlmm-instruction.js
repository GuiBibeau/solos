// @ts-check
/**
 * `add_liquidity2` from the pinned IDL (`lb_clmm` 0.12.0, commit 576919e3).
 *
 * The `*2` form carries `remaining_accounts_info` so a later Token-2022 transfer hook can be
 * appended without a new instruction. This slice passes an empty slice list: fee-bearing mints
 * are refused before build (ADR-0022). Bin arrays follow the named accounts, writable.
 */
import { address, getU64Encoder } from "@solana/kit";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const u64 = getU64Encoder();

/** `add_liquidity2`, from the IDL at the pinned commit. */
export const ADD_LIQUIDITY2_DISCRIMINATOR = Object.freeze([228, 162, 78, 28, 70, 219, 116, 115]);

/** @param {number} value @returns {Uint8Array} */
const u32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
};

/** @param {number} value @returns {Uint8Array} */
const u16 = (value) => {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
};

/** @param {number} value @returns {Uint8Array} */
const i32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
};

/** @param {...(Uint8Array | import("@solana/kit").ReadonlyUint8Array | readonly number[])} parts */
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

/** @typedef {{ readonly binId: number; readonly distributionX: number; readonly distributionY: number }} BinDistribution */

/**
 * `LiquidityParameter` then an empty `RemainingAccountsInfo`.
 * @param {{ amountX: bigint; amountY: bigint; bins: readonly BinDistribution[] }} parameter
 */
export const addLiquidity2Data = (parameter) =>
  concat(
    ADD_LIQUIDITY2_DISCRIMINATOR,
    u64.encode(parameter.amountX),
    u64.encode(parameter.amountY),
    u32(parameter.bins.length),
    ...parameter.bins.map((bin) =>
      concat(i32(bin.binId), u16(bin.distributionX), u16(bin.distributionY)),
    ),
    u32(0),
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
 *   position: string; lbPair: string; bitmapExtension: string;
 *   userTokenX: string; userTokenY: string; reserveX: string; reserveY: string;
 *   tokenXMint: string; tokenYMint: string; sender: string;
 *   tokenXProgram: string; tokenYProgram: string; eventAuthority: string;
 *   binArrays: readonly string[];
 * }} AddLiquidity2Accounts
 */

/**
 * 14 named accounts in IDL order, then one writable bin array per array the range touches.
 * `bitmapExtension` is the extension PDA when the range leaves the default bitmap, otherwise
 * the program id, which the program treats as absent. That sentinel is read-only: the program
 * is invoked in the same transaction, and an invoked program cannot be writable.
 * @param {AddLiquidity2Accounts} accounts
 */
export const addLiquidity2Accounts = (accounts) => [
  rw(accounts.position),
  rw(accounts.lbPair),
  accounts.bitmapExtension === METEORA_DLMM_PROGRAM
    ? ro(accounts.bitmapExtension)
    : rw(accounts.bitmapExtension),
  rw(accounts.userTokenX),
  rw(accounts.userTokenY),
  rw(accounts.reserveX),
  rw(accounts.reserveY),
  ro(accounts.tokenXMint),
  ro(accounts.tokenYMint),
  { address: address(accounts.sender), role: roleOf({ signer: true }) },
  ro(accounts.tokenXProgram),
  ro(accounts.tokenYProgram),
  ro(accounts.eventAuthority),
  ro(METEORA_DLMM_PROGRAM),
  ...accounts.binArrays.map((binArray) => rw(binArray)),
];

/** @param {AddLiquidity2Accounts} accounts @param {Parameters<typeof addLiquidity2Data>[0]} parameter */
export const addLiquidity2Instruction = (accounts, parameter) => ({
  programAddress: address(METEORA_DLMM_PROGRAM),
  accounts: addLiquidity2Accounts(accounts),
  data: addLiquidity2Data(parameter),
});
