// @ts-check
/**
 * Pure pinned-IDL decoders for the two Whirlpool accounts solOS reads. Every decode is
 * guarded: exact size, then the 8-byte Anchor discriminator, then the field-level rules.
 * Kit's struct decoders silently accept wrong discriminators and trailing bytes, so these
 * guards — not the decode — are what make corrupt state a typed error instead of a
 * fabricated position. BigInt only; addresses are decoded as base58 from the 32-byte fields.
 */
import {
  address,
  getBase58Decoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
} from "@solana/kit";
import {
  MAX_TICK_INDEX,
  MIN_TICK_INDEX,
  POSITION_BYTES,
  POSITION_DISCRIMINATOR,
  POSITION_OFFSETS,
  POSITION_SEED,
  WHIRLPOOL_BYTES,
  WHIRLPOOL_DISCRIMINATOR,
  WHIRLPOOL_OFFSETS,
  WHIRLPOOL_PROGRAM,
} from "./whirlpool-program.js";

const base58 = getBase58Decoder();
const utf8 = getUtf8Encoder();

/** Decoded fields of one Position account. @typedef {{ readonly whirlpool: string; readonly positionMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number }} PositionLayout */
/** Decoded fields of one Whirlpool account. @typedef {{ readonly sqrtPrice: bigint; readonly tokenMintA: string; readonly tokenMintB: string }} WhirlpoolLayout */
/** Outcome of decoding one guarded account. @typedef {{ readonly status: "decoded"; readonly layout: PositionLayout } | { readonly status: "corrupt"; readonly reason: string }} PositionRead */
/** @typedef {{ readonly status: "decoded"; readonly layout: WhirlpoolLayout } | { readonly status: "corrupt"; readonly reason: string }} WhirlpoolRead */

/** Position PDA: seeds ["position", mint bytes] under the pinned Whirlpool program — pure derivation, no RPC. @param {string} mint @returns {Promise<string>} */
export const positionAddress = (mint) =>
  getProgramDerivedAddress({
    programAddress: address(WHIRLPOOL_PROGRAM),
    seeds: [utf8.encode(POSITION_SEED), new Uint8Array(getAddressEncoder().encode(address(mint)))],
  }).then(([pda]) => pda);

/** @param {Uint8Array} bytes @param {readonly number[]} discriminator */
const hasDiscriminator = (bytes, discriminator) =>
  discriminator.every((expected, i) => bytes[i] === expected);

/** @param {DataView} view @param {number} offset @returns {bigint} u128 little-endian */
const readU128 = (view, offset) =>
  view.getBigUint64(offset, true) | (view.getBigUint64(offset + 8, true) << 64n);

/** @param {Uint8Array} bytes @param {number} offset @returns {string} one embedded 32-byte address */
const readAddress = (bytes, offset) => base58.decode(bytes.slice(offset, offset + 32));

/** @param {string} reason @returns {{ readonly status: "corrupt"; readonly reason: string }} */
const corrupt = (reason) => ({ status: "corrupt", reason });

/**
 * Guard and decode one Position account: exact 216 bytes, the Position discriminator, and a
 * tick range inside the protocol bounds with lower strictly below upper (the program's own
 * open rules — anything else cannot be a real position and must not reach the math).
 * @param {Uint8Array | null} bytes account data, or null when the account does not exist
 * @returns {PositionRead}
 */
export const decodePosition = (bytes) => {
  if (bytes === null) return corrupt("no account at the position address");
  if (bytes.length !== POSITION_BYTES) return corrupt("position account has the wrong layout");
  if (!hasDiscriminator(bytes, POSITION_DISCRIMINATOR)) {
    return corrupt("position data does not carry the Position discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tickLowerIndex = view.getInt32(POSITION_OFFSETS.tickLowerIndex, true);
  const tickUpperIndex = view.getInt32(POSITION_OFFSETS.tickUpperIndex, true);
  if (tickLowerIndex < MIN_TICK_INDEX || tickUpperIndex > MAX_TICK_INDEX) {
    return corrupt("position tick range is outside the protocol tick bounds");
  }
  if (tickLowerIndex >= tickUpperIndex) return corrupt("position tick range is inverted");
  return {
    status: "decoded",
    layout: {
      whirlpool: readAddress(bytes, POSITION_OFFSETS.whirlpool),
      positionMint: readAddress(bytes, POSITION_OFFSETS.positionMint),
      liquidity: readU128(view, POSITION_OFFSETS.liquidity),
      tickLowerIndex,
      tickUpperIndex,
    },
  };
};

/**
 * Guard and decode one Whirlpool account: exact 653 bytes and the Whirlpool discriminator.
 * @param {Uint8Array | null} bytes account data, or null when the account does not exist
 * @returns {WhirlpoolRead}
 */
export const decodeWhirlpool = (bytes) => {
  if (bytes === null) return corrupt("referenced pool is missing");
  if (bytes.length !== WHIRLPOOL_BYTES) return corrupt("referenced pool has the wrong layout");
  if (!hasDiscriminator(bytes, WHIRLPOOL_DISCRIMINATOR)) {
    return corrupt("referenced pool does not carry the Whirlpool discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    status: "decoded",
    layout: {
      sqrtPrice: readU128(view, WHIRLPOOL_OFFSETS.sqrtPrice),
      tokenMintA: readAddress(bytes, WHIRLPOOL_OFFSETS.tokenMintA),
      tokenMintB: readAddress(bytes, WHIRLPOOL_OFFSETS.tokenMintB),
    },
  };
};
