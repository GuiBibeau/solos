// @ts-check
/**
 * Byte-level fixtures for pump bonding-curve decoding and seeding, built from the layout
 * verified against the pinned IDL: 8-byte discriminator, then u64le/bool/pubkey fields in the
 * IDL field order (125 bytes total). All BigInt writes go through `DataView.setBigUint64` —
 * never through a JS Number.
 */
import { getBase16Decoder } from "@solana/kit";
import { BONDING_CURVE_DISCRIMINATOR, GLOBAL_DISCRIMINATOR } from "./pump-program.js";

/** @param {...Uint8Array} parts @returns {Uint8Array} */
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** @param {bigint} value @returns {Uint8Array} u64 little-endian */
export const u64le = (value) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
};

/** @param {number} length @returns {Uint8Array} all-zero bytes */
export const zeros = (length) => new Uint8Array(length);

/** The documented test-seed anchor for the Global config's initial real token reserves. */
export const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;

/** @typedef {Parameters<typeof bondingCurveBytes>[0]} CurveBytesOptions */

/** Full-layout defaults: zero reserves, an open curve, absent creator, native-SOL quote mint. */
const CURVE_DEFAULTS = {
  virtualTokenReserves: 0n,
  virtualQuoteReserves: 0n,
  realTokenReserves: 0n,
  realQuoteReserves: 0n,
  tokenTotalSupply: 0n,
  complete: false,
  creator: zeros(32),
  isMayhemMode: false,
  isCashbackCoin: false,
  quoteMint: zeros(32),
  creatorFeeBps: 0n,
  canEditCreatorFee: false,
  isHolderReward: false,
  discriminator: new Uint8Array(BONDING_CURVE_DISCRIMINATOR),
  bytes: 0,
};

/** A u64 field holds 0 or 1 on the wire; booleans encode as full bytes. @param {boolean} on @returns {Uint8Array} */
const flag = (on) => new Uint8Array([on ? 1 : 0]);

/** Cut or pad an assembled layout to the requested size: legacy accounts (49, 81, 82, 83, 115, 123, 124) are exact prefixes of the current 125-byte layout, truncated accounts are shorter prefixes, padded accounts carry trailing zero bytes. @param {Uint8Array} full @param {number} bytes @returns {Uint8Array} */
const toLength = (full, bytes) => {
  if (bytes === 0) return full;
  return bytes > full.length ? concat(full, zeros(bytes - full.length)) : full.slice(0, bytes);
};

/**
 * A BondingCurve account assembled in the pinned IDL field order.
 * @param {Partial<typeof CURVE_DEFAULTS>} overrides
 * @returns {Uint8Array}
 */
export const bondingCurveBytes = (overrides = {}) => {
  const o = { ...CURVE_DEFAULTS, ...overrides };
  return toLength(
    concat(
      o.discriminator,
      u64le(o.virtualTokenReserves),
      u64le(o.virtualQuoteReserves),
      u64le(o.realTokenReserves),
      u64le(o.realQuoteReserves),
      u64le(o.tokenTotalSupply),
      flag(o.complete),
      o.creator,
      flag(o.isMayhemMode),
      flag(o.isCashbackCoin),
      o.quoteMint,
      u64le(o.creatorFeeBps),
      flag(o.canEditCreatorFee),
      flag(o.isHolderReward),
    ),
    o.bytes,
  );
};

/**
 * @param {{ initialRealTokenReserves?: bigint; discriminator?: Uint8Array; bytes?: number }} [options]
 * @returns {Uint8Array} a Global config account covering the stable original prefix
 */
export const globalConfigBytes = (options = {}) => {
  const { initialRealTokenReserves = INITIAL_REAL_TOKEN_RESERVES, bytes = 0 } = options;
  const discriminator = options.discriminator ?? new Uint8Array(GLOBAL_DISCRIMINATOR);
  // initialized bool + authority + fee_recipient + two u64 config fields before the target.
  const full = concat(
    discriminator,
    new Uint8Array([1]),
    zeros(32),
    zeros(32),
    u64le(1_073_000_000_000_000n),
    u64le(30_000_000_000n),
    u64le(initialRealTokenReserves),
  );
  return toLength(full, bytes);
};

/**
 * The fresh-curve body every SOL-paired fixture shares: full real reserves against the Global
 * anchor, open curve, native-SOL quote mint. Progress expectations derive from these numbers.
 * @param {CurveBytesOptions} [overrides]
 * @returns {Uint8Array}
 */
export const freshCurveBytes = (overrides = {}) =>
  bondingCurveBytes({
    virtualTokenReserves: 1_073_000_000_000_000n,
    virtualQuoteReserves: 30_000_000_000n,
    realTokenReserves: 793_100_000_000_000n,
    realQuoteReserves: 1_000_000_000n,
    ...overrides,
  });

/** @param {Uint8Array} bytes @returns {string} base16, for `surfnet_setAccount` fixtures */
export const base16 = (bytes) => getBase16Decoder().decode(bytes);
