// @ts-check
import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { BONDING_CURVE_DISCRIMINATOR, BONDING_CURVE_SEED, PUMP_PROGRAM } from "./pump-program.js";

const utf8 = getUtf8Encoder();
const addressBytes = getAddressEncoder();

/** Absolute offsets of the fields solOS reads; the IDL field order at the pinned commit. */
const VIRTUAL_TOKEN_OFFSET = 8;
const VIRTUAL_QUOTE_OFFSET = 16;
const REAL_TOKEN_OFFSET = 24;
const REAL_QUOTE_OFFSET = 32;
const COMPLETE_OFFSET = 48;
/** Legacy accounts end at `complete` (49 bytes); quote_mint spans 83..115. */
export const LEGACY_MIN_BYTES = 49;
const QUOTE_MINT_START = 83;
const QUOTE_MINT_END = 115;

/**
 * Decoded fields of one bonding curve. `quoteMint` is absent on legacy (shorter) accounts,
 * which are SOL-paired by construction.
 * @typedef {{
 *   readonly virtualTokenReserves: bigint;
 *   readonly virtualQuoteReserves: bigint;
 *   readonly realTokenReserves: bigint;
 *   readonly realQuoteReserves: bigint;
 *   readonly complete: boolean;
 *   readonly quoteMint: Uint8Array | undefined;
 * }} BondingCurveLayout
 */

/** Outcome of decoding one curve account. @typedef {{ readonly status: "decoded"; readonly layout: BondingCurveLayout } | { readonly status: "corrupt"; readonly reason: string }} BondingCurveRead */

/** Every IDL boolean field with the minimum total account length at which it is present. */
const BOOLEAN_FIELDS = [
  { name: "complete", offset: COMPLETE_OFFSET, presentFrom: LEGACY_MIN_BYTES },
  { name: "is_mayhem_mode", offset: 81, presentFrom: 82 },
  { name: "is_cashback_coin", offset: 82, presentFrom: 83 },
  { name: "can_edit_creator_fee", offset: 123, presentFrom: 124 },
  { name: "is_holder_reward", offset: 124, presentFrom: 125 },
];

/**
 * Bonding-curve PDA: seeds ["bonding-curve", mint bytes] under the pinned pump program — pure
 * derivation, no RPC.
 * @param {string} mint
 * @returns {Promise<string>}
 */
export const bondingCurveAddress = (mint) =>
  getProgramDerivedAddress({
    programAddress: address(PUMP_PROGRAM),
    seeds: [utf8.encode(BONDING_CURVE_SEED), new Uint8Array(addressBytes.encode(address(mint)))],
  }).then(([pda]) => pda);

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {bigint} u64 little-endian
 */
const readU64 = (bytes, offset) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);

/** @param {Uint8Array} bytes @returns {boolean} whether the leading 8 bytes are the curve discriminator */
const hasCurveDiscriminator = (bytes) => {
  for (const [i, expected] of BONDING_CURVE_DISCRIMINATOR.entries()) {
    if (bytes[i] !== expected) return false;
  }
  return true;
};

/**
 * Borsh booleans are exactly one byte, 0 or 1; any other value is malformed account data,
 * never a truthy flag. A field only exists once the account reaches its length threshold, so
 * shorter legacy accounts are not failed for bytes they do not carry.
 * @param {Uint8Array} bytes
 * @returns {string | undefined} fixed reason for the first invalid boolean, if any
 */
const invalidBooleanIn = (bytes) => {
  for (const field of BOOLEAN_FIELDS) {
    if (bytes.length < field.presentFrom) continue;
    const byte = bytes[field.offset];
    if (byte !== 0 && byte !== 1) {
      return `curve field ${field.name} is a boolean byte that is neither 0 nor 1`;
    }
  }
  return undefined;
};

/**
 * Decode a bonding-curve account by length thresholds — never by equality, because the
 * protocol's history has valid legacy totals (49, 81, 82, 83, 115, 123, 124, 125) and live
 * accounts can carry trailing zero padding past the current 125-byte layout. Missing trailing
 * fields default: booleans false, integers zero, quote_mint absent. A missing quote_mint
 * means the account predates quote assets, so it is SOL-paired. Below the 49-byte legacy
 * minimum the account is truncated, not legacy; a wrong discriminator is not a curve at all;
 * a boolean byte outside 0 and 1 is malformed data.
 * @param {Uint8Array | null} bytes account data, or null when the account does not exist
 * @returns {BondingCurveRead}
 */
export const decodeBondingCurve = (bytes) => {
  if (bytes === null) return { status: "corrupt", reason: "curve account is absent" };
  if (bytes.length < LEGACY_MIN_BYTES) {
    return {
      status: "corrupt",
      reason: "curve account is truncated below the legacy layout minimum",
    };
  }
  if (!hasCurveDiscriminator(bytes)) {
    return {
      status: "corrupt",
      reason: "curve data does not carry the BondingCurve discriminator",
    };
  }
  const badBoolean = invalidBooleanIn(bytes);
  if (badBoolean !== undefined) return { status: "corrupt", reason: badBoolean };
  return {
    status: "decoded",
    layout: {
      virtualTokenReserves: readU64(bytes, VIRTUAL_TOKEN_OFFSET),
      virtualQuoteReserves: readU64(bytes, VIRTUAL_QUOTE_OFFSET),
      realTokenReserves: readU64(bytes, REAL_TOKEN_OFFSET),
      realQuoteReserves: readU64(bytes, REAL_QUOTE_OFFSET),
      complete: bytes[COMPLETE_OFFSET] === 1,
      quoteMint:
        bytes.length >= QUOTE_MINT_END ? bytes.slice(QUOTE_MINT_START, QUOTE_MINT_END) : undefined,
    },
  };
};

/**
 * The SOL-only quote gate: an absent field (legacy account) or an all-zero stored quote mint
 * (native SOL as stored on the account) passes; wSOL is a trade-instruction convention and is
 * never special-cased here.
 * @param {Uint8Array | undefined} quoteMint
 */
export const isSolQuote = (quoteMint) => quoteMint === undefined || quoteMint.every((b) => b === 0);
