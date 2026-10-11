// @ts-check

/** The classic program allocates exactly Mint::LEN = 82; 165 bytes would be a token account. */
export const CLASSIC_MINT_BYTES = 82;
/**
 * Extension-bearing Token-2022 layout (interface/src/extension/mod.rs): after the 82-byte base
 * come 83 bytes of zero padding, so the AccountType byte always sits at 165 (the length of a
 * classic Account — that anchor is what keeps mints and accounts distinguishable) and the TLV
 * records start at 166. AccountType: Uninitialized = 0, Mint = 1, Account = 2.
 */
export const ACCOUNT_TYPE_OFFSET = 165;
export const EXTENSIONS_OFFSET = 166;
export const ACCOUNT_TYPE_MINT = 1;
/** A 355-byte Token-2022 account is a Multisig — the program rejects it as account data. */
export const MULTISIG_ACCOUNT_BYTES = 355;

/**
 * Outcome of the layout guards, before any metadata work. `not-a-mint` maps to `UnknownToken`
 * (covers wrong owner, wrong length — including a token account passed as a mint —
 * uninitialized and undecodable base layout); `account-too-large` maps to
 * `TokenMetadataUnavailable` so oversized accounts fail promptly instead of being decoded.
 * @typedef {{
 *   readonly verdict: "mint";
 *   readonly program: "spl" | "token-2022";
 *   readonly decimals: number;
 *   readonly extensions: Uint8Array | undefined;
 * } | {
 *   readonly verdict: "not-a-mint";
 *   readonly reason: string;
 * } | {
 *   readonly verdict: "account-too-large";
 *   readonly bytes: number;
 * }} MintLayout
 */

/** Extension discriminants, from interface/src/extension/mod.rs. */
export const TRANSFER_FEE_CONFIG = 1;
/** `TransferHook` in that same enum. Authority then program id, 32 bytes each. */
export const TRANSFER_HOOK = 14;
const TLV_HEADER_BYTES = 4;
const HOOK_PROGRAM_BYTES = 32;
const HOOK_VALUE_BYTES = 64;

/**
 * Whether the extension area declares a transfer fee. Records are TLV: a u16 type, a u16
 * length, then the value — so the types can be walked without decoding any of them. A
 * truncated trailing record ends the walk rather than throwing: an unreadable tail cannot be
 * proven fee-free, but it also cannot be decoded, and the mint guards reject it upstream.
 * @param {Uint8Array | undefined} extensions
 * @returns {boolean}
 */
export const hasTransferFee = (extensions) => {
  if (extensions === undefined) return false;
  const view = new DataView(extensions.buffer, extensions.byteOffset, extensions.byteLength);
  let at = 0;
  while (at + TLV_HEADER_BYTES <= extensions.length) {
    if (view.getUint16(at, true) === TRANSFER_FEE_CONFIG) return true;
    at += TLV_HEADER_BYTES + view.getUint16(at + 2, true);
  }
  return false;
};

/** @param {Uint8Array} value */
const hookProgramIsSet = (value) => {
  for (let index = HOOK_PROGRAM_BYTES; index < HOOK_VALUE_BYTES; index += 1) {
    if (value[index] !== 0) return true;
  }
  return false;
};

/**
 * The `TransferHook` value, when the area declares one. A short slice means the record
 * was truncated; callers treat that as active so an unreadable hook is not accepted.
 * @param {Uint8Array | undefined} extensions
 * @returns {Uint8Array | undefined}
 */
const transferHookValue = (extensions) => {
  if (extensions === undefined) return undefined;
  const view = new DataView(extensions.buffer, extensions.byteOffset, extensions.byteLength);
  let at = 0;
  while (at + TLV_HEADER_BYTES <= extensions.length) {
    const type = view.getUint16(at, true);
    const length = view.getUint16(at + 2, true);
    const start = at + TLV_HEADER_BYTES;
    if (type === TRANSFER_HOOK) return extensions.subarray(start, start + length);
    at = start + length;
  }
  return undefined;
};

/**
 * Whether the mint has a transfer hook whose program id is set. A zero program id is the
 * disabled form and is not a hook. A truncated record fails closed.
 * @param {Uint8Array | undefined} extensions
 * @returns {boolean}
 */
export const hasActiveTransferHook = (extensions) => {
  const value = transferHookValue(extensions);
  if (value === undefined) return false;
  if (value.length < HOOK_VALUE_BYTES) return true;
  return hookProgramIsSet(value);
};

/**
 * Exactly the 82-byte base is a valid extension-less mint. Anything longer follows the padded
 * protocol layout: total lengths 83..165 have no AccountType location at all, and otherwise the
 * byte at 165 must say Mint before the bytes from 166 are handed over as extension records.
 * @param {number} decimals
 * @param {Uint8Array} data
 * @returns {MintLayout}
 */
export const token2022Layout = (decimals, data) => {
  if (data.length === CLASSIC_MINT_BYTES) {
    return { verdict: "mint", program: "token-2022", decimals, extensions: undefined };
  }
  if (data.length === MULTISIG_ACCOUNT_BYTES) {
    return { verdict: "not-a-mint", reason: "a 355-byte token-2022 account is a multisig" };
  }
  if (data.length < EXTENSIONS_OFFSET) {
    return {
      verdict: "not-a-mint",
      reason: "token-2022 mint with extensions is at least 166 bytes; this is not a mint",
    };
  }
  for (let i = CLASSIC_MINT_BYTES; i < ACCOUNT_TYPE_OFFSET; i++) {
    if (data[i] !== 0) {
      return {
        verdict: "not-a-mint",
        reason: "token-2022 padding before the account type byte is not zero",
      };
    }
  }
  if (data[ACCOUNT_TYPE_OFFSET] !== ACCOUNT_TYPE_MINT) {
    return {
      verdict: "not-a-mint",
      reason: "token-2022 account type byte says this is not a Mint",
    };
  }
  return {
    verdict: "mint",
    program: "token-2022",
    decimals,
    extensions: data.slice(EXTENSIONS_OFFSET),
  };
};
