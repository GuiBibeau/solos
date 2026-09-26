// @ts-check
/**
 * Pure decoders for the Meteora accounts a position read needs. Same discipline as the
 * Raydium ones: size, then the Anchor discriminator, then the field rules. A short account
 * is refused before the discriminator so a truncated buffer cannot pass as the wrong type.
 */
import { getBase58Decoder } from "@solana/kit";
import { positionWindow } from "./meteora-dlmm-bins.js";
import {
  BIN_ARRAY_BYTES,
  BIN_ARRAY_DISCRIMINATOR,
  BIN_ARRAY_OFFSETS,
  BIN_BYTES,
  BIN_OFFSETS,
  BINS_PER_ARRAY,
  LB_PAIR_BYTES,
  LB_PAIR_DISCRIMINATOR,
  LB_PAIR_OFFSETS,
  POSITION_V2_BYTES,
  POSITION_V2_DISCRIMINATOR,
  POSITION_V2_OFFSETS,
} from "./meteora-dlmm-program.js";

const base58 = getBase58Decoder();

/** @typedef {import("./meteora-dlmm-bins.js").OccupiedBin} OccupiedBin */
/** @typedef {{ readonly lbPair: string; readonly owner: string; readonly lowerBinId: number; readonly upperBinId: number; readonly liquidity: bigint; readonly bins: readonly OccupiedBin[] }} MeteoraPositionLayout */
/** @typedef {{ readonly tokenMintX: string; readonly tokenMintY: string; readonly activeId: number; readonly binStep: number }} MeteoraPairLayout */
/** @typedef {{ readonly index: number; readonly lbPair: string; readonly bytes: Uint8Array }} MeteoraBinArrayLayout */
/** @typedef {{ readonly amountX: bigint; readonly amountY: bigint; readonly liquiditySupply: bigint }} MeteoraBinSlot */
/** @typedef {{ readonly status: "decoded"; readonly layout: MeteoraPositionLayout } | { readonly status: "corrupt"; readonly reason: string }} MeteoraPositionRead */
/** @typedef {{ readonly status: "decoded"; readonly layout: MeteoraPairLayout } | { readonly status: "corrupt"; readonly reason: string }} MeteoraPairRead */
/** @typedef {{ readonly status: "decoded"; readonly layout: MeteoraBinArrayLayout } | { readonly status: "corrupt"; readonly reason: string }} MeteoraBinArrayRead */

/** @param {string} reason @returns {{ readonly status: "corrupt"; readonly reason: string }} */
const corrupt = (reason) => ({ status: "corrupt", reason });

/** @param {Uint8Array} bytes @param {readonly number[]} discriminator */
const hasDiscriminator = (bytes, discriminator) =>
  discriminator.every((expected, index) => bytes[index] === expected);

/** @param {DataView} view @param {number} offset @returns {bigint} */
const readU128 = (view, offset) =>
  view.getBigUint64(offset, true) | (view.getBigUint64(offset + 8, true) << 64n);

/** @param {Uint8Array} bytes @param {number} offset */
const readAddress = (bytes, offset) => base58.decode(bytes.slice(offset, offset + 32));

/**
 * @param {Uint8Array} bytes
 * @param {{ expected: number; shortReason: string; sizeReason: string }} spec
 */
const sizeGuard = (bytes, spec) => {
  if (bytes.length < spec.expected) return corrupt(spec.shortReason);
  if (bytes.length !== spec.expected) return corrupt(spec.sizeReason);
  return null;
};

/** @param {DataView} view @returns {bigint[]} */
const readShares = (view) =>
  Array.from({ length: BINS_PER_ARRAY }, (_unused, index) =>
    readU128(view, POSITION_V2_OFFSETS.liquidityShares + index * 16),
  );

/**
 * Guard and decode one PositionV2. Liquidity is the exact sum of in-window shares.
 * @param {Uint8Array | null} bytes
 * @returns {MeteoraPositionRead}
 */
export const decodePositionV2 = (bytes) => {
  if (bytes === null) return corrupt("no account at the position address");
  const sized = sizeGuard(bytes, {
    expected: POSITION_V2_BYTES,
    shortReason: "position account is shorter than the PositionV2 layout",
    sizeReason: "position account has the wrong layout",
  });
  if (sized !== null) return sized;
  if (!hasDiscriminator(bytes, POSITION_V2_DISCRIMINATOR)) {
    return corrupt("position data does not carry the PositionV2 discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowerBinId = view.getInt32(POSITION_V2_OFFSETS.lowerBinId, true);
  const upperBinId = view.getInt32(POSITION_V2_OFFSETS.upperBinId, true);
  const window = positionWindow({ lowerBinId, upperBinId, shares: readShares(view) });
  if (window.status !== "ok") return window;
  return {
    status: "decoded",
    layout: {
      lbPair: readAddress(bytes, POSITION_V2_OFFSETS.lbPair),
      owner: readAddress(bytes, POSITION_V2_OFFSETS.owner),
      lowerBinId,
      upperBinId,
      liquidity: window.liquidity,
      bins: window.bins,
    },
  };
};

/**
 * Guard and decode one LbPair. Decimals are not on the pair; the mint accounts carry them.
 * @param {Uint8Array | null} bytes
 * @returns {MeteoraPairRead}
 */
export const decodeLbPair = (bytes) => {
  if (bytes === null) return corrupt("referenced pair is missing");
  const sized = sizeGuard(bytes, {
    expected: LB_PAIR_BYTES,
    shortReason: "referenced pair is shorter than the LbPair layout",
    sizeReason: "referenced pair has the wrong layout",
  });
  if (sized !== null) return sized;
  if (!hasDiscriminator(bytes, LB_PAIR_DISCRIMINATOR)) {
    return corrupt("referenced pair does not carry the LbPair discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    status: "decoded",
    layout: {
      tokenMintX: readAddress(bytes, LB_PAIR_OFFSETS.tokenMintX),
      tokenMintY: readAddress(bytes, LB_PAIR_OFFSETS.tokenMintY),
      activeId: view.getInt32(LB_PAIR_OFFSETS.activeId, true),
      binStep: view.getUint16(LB_PAIR_OFFSETS.binStep, true),
    },
  };
};

/**
 * Guard and decode a BinArray header. Bin bodies stay in `layout.bytes` for `binSlot`.
 * @param {Uint8Array | null} bytes
 * @returns {MeteoraBinArrayRead}
 */
export const decodeBinArray = (bytes) => {
  if (bytes === null) return corrupt("referenced bin array is missing");
  const sized = sizeGuard(bytes, {
    expected: BIN_ARRAY_BYTES,
    shortReason: "bin array account is shorter than the BinArray layout",
    sizeReason: "bin array account has the wrong layout",
  });
  if (sized !== null) return sized;
  if (!hasDiscriminator(bytes, BIN_ARRAY_DISCRIMINATOR)) {
    return corrupt("bin array data does not carry the BinArray discriminator");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const index = view.getBigInt64(BIN_ARRAY_OFFSETS.index, true);
  if (!Number.isSafeInteger(Number(index))) return corrupt("bin array index does not fit a bin id");
  return {
    status: "decoded",
    layout: {
      index: Number(index),
      lbPair: readAddress(bytes, BIN_ARRAY_OFFSETS.lbPair),
      bytes,
    },
  };
};

/**
 * One bin inside a decoded array. `offset` is the slot, not the bin id.
 * @param {MeteoraBinArrayLayout} layout
 * @param {number} offset
 * @returns {MeteoraBinSlot}
 */
export const binSlot = (layout, offset) => {
  const at = BIN_ARRAY_OFFSETS.bins + offset * BIN_BYTES;
  const view = new DataView(layout.bytes.buffer, layout.bytes.byteOffset, layout.bytes.byteLength);
  return {
    amountX: view.getBigUint64(at + BIN_OFFSETS.amountX, true),
    amountY: view.getBigUint64(at + BIN_OFFSETS.amountY, true),
    liquiditySupply: readU128(view, at + BIN_OFFSETS.liquiditySupply),
  };
};
