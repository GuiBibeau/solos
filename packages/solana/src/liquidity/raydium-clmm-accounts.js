// @ts-check
/**
 * The PDAs and tick-array arithmetic a Raydium CLMM liquidity instruction needs.
 *
 * Two upstream helpers are wrong here and must not be copied: Raydium's own test helper derives
 * the protocol position with a `"protocol_position"` seed prefix (the program uses `"position"`),
 * and their SDK encodes its tick bytes little-endian (the program uses big-endian). A live
 * mainnet transaction succeeds while passing protocol-position accounts that do not exist,
 * because the program deprecated that account and no longer reads it — so a wrong derivation
 * there fails silently today and loudly later. Everything below follows the Rust source.
 */
import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";

const utf8 = getUtf8Encoder();
const addressBytes = getAddressEncoder();

/** Ticks per tick array, before spacing. `TICK_ARRAY_SIZE` in the program. */
export const TICK_ARRAY_SIZE = 60;

/** The default bitmap covers +/- (tick_spacing * 30720); beyond that the extension is required. */
const DEFAULT_BITMAP_TICKS = TICK_ARRAY_SIZE * 512;

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(addressBytes.encode(address(key)));

/** An i32 as four big-endian bytes, which is what every tick-bearing seed uses. @param {number} value */
export const i32BigEndian = (value) => {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, false);
  return bytes;
};

/** @param {Parameters<typeof getProgramDerivedAddress>[0]["seeds"]} seeds */
const pda = (seeds) =>
  getProgramDerivedAddress({ programAddress: address(RAYDIUM_CLMM_PROGRAM), seeds }).then(
    ([key]) => key,
  );

/**
 * The tick array a tick belongs to. Floor division by `60 * tick_spacing` — the correction for
 * negative ticks is the part that is easy to get wrong, and getting it wrong means passing an
 * array the program rejects with `InvalidTickArray`.
 * @param {number} tick @param {number} tickSpacing
 */
export const tickArrayStartIndex = (tick, tickSpacing) => {
  const span = TICK_ARRAY_SIZE * tickSpacing;
  const truncated = Math.trunc(tick / span);
  const start = tick < 0 && tick % span !== 0 ? truncated - 1 : truncated;
  return start * span;
};

/** @param {string} pool @param {number} startIndex */
export const tickArrayAddress = (pool, startIndex) =>
  pda([utf8.encode("tick_array"), keyBytes(pool), i32BigEndian(startIndex)]);

/** @param {string} pool */
export const bitmapExtensionAddress = (pool) =>
  pda([utf8.encode("pool_tick_array_bitmap_extension"), keyBytes(pool)]);

/**
 * The deprecated aggregate position. Passed read-only and never required to exist; the seeds are
 * the program's, not the SDK's.
 * @param {string} pool @param {number} tickLower @param {number} tickUpper
 */
export const protocolPositionAddress = (pool, tickLower, tickUpper) =>
  pda([utf8.encode("position"), keyBytes(pool), i32BigEndian(tickLower), i32BigEndian(tickUpper)]);

/**
 * Whether this position's tick arrays fall outside the pool's default bitmap, which decides
 * whether the extension account must ride along. At `tick_spacing = 1` the default covers only
 * +/-30720 ticks, so most of the usable range needs it — this is not an edge case.
 *
 * Decided by the arithmetic, never by whether the extension account happens to exist: it can
 * exist for a pool without being required for a given position.
 * @param {{ tickLower: number; tickUpper: number; tickSpacing: number }} position
 */
export const needsBitmapExtension = ({ tickLower, tickUpper, tickSpacing }) => {
  const boundary = tickSpacing * DEFAULT_BITMAP_TICKS;
  return [tickLower, tickUpper].some((tick) => {
    const start = tickArrayStartIndex(tick, tickSpacing);
    return start >= boundary || start < -boundary;
  });
};
