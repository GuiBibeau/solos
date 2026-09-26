// @ts-check
/**
 * Pure PositionV2, LbPair, and BinArray byte builders. Layouts come from
 * `meteora-dlmm-program.js`. Surfnet seeding and the decode tests share these so a fixture
 * cannot drift from the decoder.
 */
import { address, getAddressEncoder } from "@solana/kit";
import { binArrayIndexOf, binOffset } from "./meteora-dlmm-bins.js";
import {
  BIN_ARRAY_BYTES,
  BIN_ARRAY_DISCRIMINATOR,
  BIN_ARRAY_OFFSETS,
  BIN_BYTES,
  BIN_OFFSETS,
  LB_PAIR_BYTES,
  LB_PAIR_DISCRIMINATOR,
  LB_PAIR_OFFSETS,
  POSITION_V2_BYTES,
  POSITION_V2_DISCRIMINATOR,
  POSITION_V2_OFFSETS,
} from "./meteora-dlmm-program.js";

const encoder = getAddressEncoder();

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(encoder.encode(address(key)));

/** @param {DataView} view @param {number} offset @param {bigint} value */
const writeU128 = (view, offset, value) => {
  view.setBigUint64(offset, BigInt.asUintN(64, value), true);
  view.setBigUint64(offset + 8, value >> 64n, true);
};

/**
 * @param {{ lbPair: string; owner: string; lowerBinId?: number; upperBinId?: number;
 *   shares?: readonly { index: number; share: bigint }[]; discriminator?: Uint8Array;
 *   bytes?: number }} o
 */
export const meteoraPositionBytes = (o) => {
  const full = new Uint8Array(POSITION_V2_BYTES);
  full.set(o.discriminator ?? new Uint8Array(POSITION_V2_DISCRIMINATOR), 0);
  const view = new DataView(full.buffer);
  full.set(keyBytes(o.lbPair), POSITION_V2_OFFSETS.lbPair);
  full.set(keyBytes(o.owner), POSITION_V2_OFFSETS.owner);
  view.setInt32(POSITION_V2_OFFSETS.lowerBinId, o.lowerBinId ?? 0, true);
  view.setInt32(POSITION_V2_OFFSETS.upperBinId, o.upperBinId ?? 0, true);
  const shares = o.shares ?? [];
  for (const entry of shares) {
    writeU128(view, POSITION_V2_OFFSETS.liquidityShares + entry.index * 16, entry.share);
  }
  return o.bytes === undefined ? full : full.slice(0, o.bytes);
};

/**
 * @param {{ mintX: string; mintY: string; activeId?: number; binStep?: number;
 *   reserveX?: string; reserveY?: string; discriminator?: Uint8Array; bytes?: number }} o
 */
export const meteoraPairBytes = (o) => {
  const full = new Uint8Array(LB_PAIR_BYTES);
  full.set(o.discriminator ?? new Uint8Array(LB_PAIR_DISCRIMINATOR), 0);
  const view = new DataView(full.buffer);
  view.setInt32(LB_PAIR_OFFSETS.activeId, o.activeId ?? 0, true);
  view.setUint16(LB_PAIR_OFFSETS.binStep, o.binStep ?? 1, true);
  full.set(keyBytes(o.mintX), LB_PAIR_OFFSETS.tokenMintX);
  full.set(keyBytes(o.mintY), LB_PAIR_OFFSETS.tokenMintY);
  if (o.reserveX !== undefined) full.set(keyBytes(o.reserveX), LB_PAIR_OFFSETS.reserveX);
  if (o.reserveY !== undefined) full.set(keyBytes(o.reserveY), LB_PAIR_OFFSETS.reserveY);
  return o.bytes === undefined ? full : full.slice(0, o.bytes);
};

/**
 * One bin to stamp into an array. `binId` must belong to `index`.
 * @typedef {{ readonly binId: number; readonly amountX: bigint; readonly amountY: bigint; readonly supply: bigint }} BinSeed
 */

/**
 * @param {{ lbPair: string; index: number; bins?: readonly BinSeed[]; discriminator?: Uint8Array;
 *   bytes?: number }} o
 */
export const meteoraBinArrayBytes = (o) => {
  const full = new Uint8Array(BIN_ARRAY_BYTES);
  full.set(o.discriminator ?? new Uint8Array(BIN_ARRAY_DISCRIMINATOR), 0);
  const view = new DataView(full.buffer);
  view.setBigInt64(BIN_ARRAY_OFFSETS.index, BigInt(o.index), true);
  full.set(keyBytes(o.lbPair), BIN_ARRAY_OFFSETS.lbPair);
  const bins = o.bins ?? [];
  for (const bin of bins) writeBin(view, o.index, bin);
  return o.bytes === undefined ? full : full.slice(0, o.bytes);
};

/**
 * @param {DataView} view
 * @param {number} index
 * @param {BinSeed} bin
 */
const writeBin = (view, index, bin) => {
  if (binArrayIndexOf(bin.binId) !== index) {
    throw new Error("bin does not belong to this bin array");
  }
  const at = BIN_ARRAY_OFFSETS.bins + binOffset(bin.binId) * BIN_BYTES;
  view.setBigUint64(at + BIN_OFFSETS.amountX, bin.amountX, true);
  view.setBigUint64(at + BIN_OFFSETS.amountY, bin.amountY, true);
  writeU128(view, at + BIN_OFFSETS.liquiditySupply, bin.supply);
};
