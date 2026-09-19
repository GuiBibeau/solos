// @ts-check
/**
 * Byte-level fixtures for Whirlpool Position/Whirlpool decoding and seeding, built from the
 * layout verified against the pinned IDL artifact: 8-byte discriminator, then the fixed
 * little-endian fields in IDL field order (Position 216 bytes, Whirlpool 653). All BigInt
 * writes go through `DataView` — never through a JS Number.
 */
import { address, getAddressEncoder, getBase16Decoder } from "@solana/kit";
import {
  POSITION_BYTES,
  POSITION_DISCRIMINATOR,
  WHIRLPOOL_BYTES,
  WHIRLPOOL_DISCRIMINATOR,
} from "./whirlpool-program.js";

/** The Q64.64 sqrt price of tick 0: 2^64. */
export const SQRT_PRICE_ONE = 1n << 64n;

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

/** Highest u64 chunk, the mask per setBigUint64 slice. */
const U64_MAX = (1n << 64n) - 1n;

/** @param {bigint} value @param {number} bytes @returns {Uint8Array} little-endian unsigned */
export const uintLE = (value, bytes) => {
  const out = new Uint8Array(bytes);
  const view = new DataView(out.buffer);
  let rest = value;
  for (let i = 0; i < bytes / 8; i += 1) {
    view.setBigUint64(i * 8, rest & U64_MAX, true);
    rest >>= 64n;
  }
  return out;
};

/** @param {number} value @returns {Uint8Array} i32 little-endian */
const i32le = (value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value, true);
  return out;
};

/** @param {number} value @returns {Uint8Array} u16 little-endian */
const u16le = (value) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
};

/** @param {number} length @returns {Uint8Array} all-zero bytes */
export const zeros = (length) => new Uint8Array(length);

/** 32 bytes of an address as the layouts embed them. @param {string} account */
export const addressBytes = (account) =>
  new Uint8Array(getAddressEncoder().encode(address(account)));

/** @typedef {Parameters<typeof positionBytes>[0]} PositionBytesOptions */

/** Position defaults: an empty full-range-style position in a pool, no fees, no rewards. */
const POSITION_DEFAULTS = {
  discriminator: new Uint8Array(POSITION_DISCRIMINATOR),
  whirlpool: zeros(32),
  positionMint: zeros(32),
  liquidity: 0n,
  tickLowerIndex: -1000,
  tickUpperIndex: 1000,
  bytes: 0,
};

/**
 * A Position account assembled in the pinned IDL field order (216 bytes).
 * @param {Partial<typeof POSITION_DEFAULTS>} overrides
 * @returns {Uint8Array}
 */
export const positionBytes = (overrides = {}) => {
  const o = { ...POSITION_DEFAULTS, ...overrides };
  const full = concat(
    o.discriminator,
    o.whirlpool,
    o.positionMint,
    uintLE(o.liquidity, 16),
    i32le(o.tickLowerIndex),
    i32le(o.tickUpperIndex),
    zeros(120), // fee growth/owed A + B, then 3 reward infos
  );
  return o.bytes === 0 ? full : full.slice(0, o.bytes);
};

/** @typedef {Parameters<typeof whirlpoolBytes>[0]} WhirlpoolBytesOptions */

/** Whirlpool defaults: an active pool at sqrtPrice 2^64 (tick 0) with two zero mints. */
const WHIRLPOOL_DEFAULTS = {
  discriminator: new Uint8Array(WHIRLPOOL_DISCRIMINATOR),
  sqrtPrice: SQRT_PRICE_ONE,
  liquidity: 0n,
  tickCurrentIndex: 0,
  tokenMintA: zeros(32),
  tokenMintB: zeros(32),
  bytes: 0,
};

/**
 * A Whirlpool account assembled in the pinned IDL field order (653 bytes).
 * @param {Partial<typeof WHIRLPOOL_DEFAULTS>} overrides
 * @returns {Uint8Array}
 */
export const whirlpoolBytes = (overrides = {}) => {
  const o = { ...WHIRLPOOL_DEFAULTS, ...overrides };
  const full = concat(
    o.discriminator,
    zeros(32), // whirlpools_config
    zeros(1), // whirlpool_bump
    u16le(64), // tick_spacing
    zeros(2), // fee_tier_index_seed
    u16le(0), // fee_rate
    u16le(0), // protocol_fee_rate
    uintLE(o.liquidity, 16),
    uintLE(o.sqrtPrice, 16),
    i32le(o.tickCurrentIndex),
    zeros(16), // protocol fees owed A + B
    o.tokenMintA,
    zeros(32), // token_vault_a
    zeros(16), // fee_growth_global_a
    o.tokenMintB,
    zeros(32), // token_vault_b
    zeros(16), // fee_growth_global_b
    zeros(8), // reward_last_updated_timestamp
    zeros(384), // reward_infos
  );
  return o.bytes === 0 ? full : full.slice(0, o.bytes);
};

/** @param {Uint8Array} bytes @returns {string} base16, for `surfnet_setAccount` fixtures */
export const base16 = (bytes) => getBase16Decoder().decode(bytes);

/** Total length guard so a layout edit cannot silently drift from the pinned sizes. */
if (positionBytes().length !== POSITION_BYTES || whirlpoolBytes().length !== WHIRLPOOL_BYTES) {
  throw new Error("whirlpool fixture layout drifted from the pinned account sizes");
}
