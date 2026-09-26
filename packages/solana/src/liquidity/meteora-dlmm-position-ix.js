// @ts-check
/**
 * `initialize_position` and `close_position2` from the pinned IDL (`lb_clmm` 0.12.0,
 * commit 576919e3).
 *
 * Open is empty: `lower_bin_id` and `width` only. The position account is a writable signer,
 * created by the program's system-program CPI. Close is `close_position2`, the variant the
 * pinned client uses to retire a position. `close_position_if_empty` is not used: when shares
 * remain it succeeds and does nothing. After the five named accounts, close appends the two
 * writable bin arrays from the pinned CLI's `get_bin_array_accounts_meta_coverage`: the array
 * that contains `lower_bin_id`, then the next array. That pair is the position's, not a range
 * chosen here.
 */
import { address } from "@solana/kit";
import { binArrayIndexOf } from "./meteora-dlmm-bins.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** `initialize_position`, from the IDL at the pinned commit. */
export const INITIALIZE_POSITION_DISCRIMINATOR = Object.freeze([
  219, 192, 234, 71, 190, 191, 102, 80,
]);

/** `close_position2`, from the IDL at the pinned commit. */
export const CLOSE_POSITION2_DISCRIMINATOR = Object.freeze([174, 90, 35, 115, 186, 40, 147, 226]);

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const RENT_SYSVAR = "SysvarRent111111111111111111111111111111111";

/** @param {number} value @returns {Uint8Array} */
const i32 = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return bytes;
};

/** @param {...(Uint8Array | readonly number[])} parts */
const concat = (...parts) => Uint8Array.from(parts.flatMap((part) => [...part]));

/** @param {{ lowerBinId: number; width: number }} args */
export const initializePositionData = (args) =>
  concat(INITIALIZE_POSITION_DISCRIMINATOR, i32(args.lowerBinId), i32(args.width));

/** `close_position2` takes no arguments. Emptiness is enforced before this is built. */
export const closePosition2Data = () => Uint8Array.from(CLOSE_POSITION2_DISCRIMINATOR);

/**
 * Bin-array indexes a close names. The pinned CLI ignores `upper_bin_id` and always covers
 * the lower bin's array plus the next one, which is enough for a base position of at most 70 bins.
 * @param {number} lowerBinId
 * @returns {[number, number]}
 */
export const closeCoverageIndexes = (lowerBinId) => {
  const lower = binArrayIndexOf(lowerBinId);
  return [lower, lower + 1];
};

/** @param {{ writable?: boolean; signer?: boolean }} account */
const roleOf = ({ writable = false, signer = false }) => (writable ? 1 : 0) + (signer ? 2 : 0);

/** @param {string} key */
const ro = (key) => ({ address: address(key), role: roleOf({}) });

/**
 * Eight accounts in IDL order. Index 0 is the fee payer. Index 1 is the ephemeral position
 * key. Index 3 is the owner, the same key as the fee payer, so the message still has two
 * signers rather than three.
 * @param {{ payer: string; position: string; lbPair: string; owner: string; eventAuthority: string }} accounts
 */
export const initializePositionAccounts = (accounts) => [
  { address: address(accounts.payer), role: roleOf({ writable: true, signer: true }) },
  { address: address(accounts.position), role: roleOf({ writable: true, signer: true }) },
  ro(accounts.lbPair),
  { address: address(accounts.owner), role: roleOf({ signer: true }) },
  ro(SYSTEM_PROGRAM),
  ro(RENT_SYSVAR),
  ro(accounts.eventAuthority),
  ro(METEORA_DLMM_PROGRAM),
];

/**
 * Five accounts in IDL order, then one writable bin array per coverage index. The sender signs;
 * the rent receiver is the owner and is writable. Bin arrays are writable and do not sign,
 * matching `AccountMeta::new` in the pinned CLI.
 * @param {{ position: string; sender: string; rentReceiver: string; eventAuthority: string;
 *   binArrays: readonly string[] }} accounts
 */
export const closePosition2Accounts = (accounts) => [
  { address: address(accounts.position), role: roleOf({ writable: true }) },
  { address: address(accounts.sender), role: roleOf({ signer: true }) },
  { address: address(accounts.rentReceiver), role: roleOf({ writable: true }) },
  ro(accounts.eventAuthority),
  ro(METEORA_DLMM_PROGRAM),
  ...accounts.binArrays.map((binArray) => ({
    address: address(binArray),
    role: roleOf({ writable: true }),
  })),
];

/** @param {ReturnType<typeof initializePositionAccounts>} accounts @param {Uint8Array} data */
const instruction = (accounts, data) => ({
  programAddress: address(METEORA_DLMM_PROGRAM),
  accounts,
  data,
});

/** @param {Parameters<typeof initializePositionAccounts>[0]} accounts @param {{ lowerBinId: number; width: number }} args */
export const initializePositionInstruction = (accounts, args) =>
  instruction(initializePositionAccounts(accounts), initializePositionData(args));

/** @param {Parameters<typeof closePosition2Accounts>[0]} accounts */
export const closePosition2Instruction = (accounts) =>
  instruction(closePosition2Accounts(accounts), closePosition2Data());
