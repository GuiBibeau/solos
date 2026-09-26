// @ts-check
/**
 * Batched bin-array reads for one Meteora enumeration.
 *
 * Occupied bin-array PDAs are collected across every decoded PositionV2, then fetched
 * once. A shared array is not read again per position. The first position that references
 * a bad array fails the whole enumeration.
 */
import { LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { BATCH_CHUNK, chunksOf, fetchAccounts } from "./liquidity-accounts.js";
import { binArrayAddress, binArrayIndexOf } from "./meteora-dlmm-bins.js";
import { binSlot, decodeBinArray } from "./meteora-dlmm-decode.js";
import { BINS_PER_ARRAY, METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraBinSlot} MeteoraBinSlot */
/** @typedef {import("./liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {{ readonly address: string; readonly layout: MeteoraPositionLayout }} FoundMeteora */
/** @typedef {Map<number, MeteoraBinSlot>} BinSlots */
/** @typedef {Map<string, BinSlots>} BinCache */
/** @typedef {{ readonly lbPair: string; readonly index: number; readonly position: string }} BinRef */
/** @typedef {BinRef & { readonly address: string }} BinTarget */
/** @typedef {{ byKey: Map<string, BinRef>; targets: BinRef[] }} BinIndex */

/** @param {string} position @param {string} reason */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/** @param {string} lbPair @param {number} index */
export const binKey = (lbPair, index) => `${lbPair}:${index}`;

/**
 * @param {BinIndex} state
 * @param {FoundMeteora} item
 * @param {number} index
 */
const rememberBin = (state, item, index) => {
  const key = binKey(item.layout.lbPair, index);
  if (state.byKey.has(key)) return;
  const target = { lbPair: item.layout.lbPair, index, position: item.address };
  state.byKey.set(key, target);
  state.targets.push(target);
};

/**
 * Unique occupied bin arrays, in first-referrer order.
 * @param {readonly FoundMeteora[]} found
 * @returns {BinRef[]}
 */
const referencedBins = (found) => {
  /** @type {BinIndex} */
  const state = { byKey: new Map(), targets: [] };
  for (const item of found) {
    const indexes = new Set(item.layout.bins.map((bin) => binArrayIndexOf(bin.binId)));
    for (const index of indexes) rememberBin(state, item, index);
  }
  return state.targets;
};

/** @param {readonly BinRef[]} targets */
const addressedBins = (targets) =>
  Effect.promise(() =>
    Promise.all(
      targets.map(async (target) => ({
        ...target,
        address: await binArrayAddress(target.lbPair, target.index),
      })),
    ),
  );

/**
 * @param {BinTarget} target
 * @param {FetchedAccount | null | undefined} row
 * @returns {Effect.Effect<import("./meteora-dlmm-decode.js").MeteoraBinArrayLayout, LiquidityPositionUnavailable>}
 */
const guardedBinArray = (target, row) => {
  if (row === null || row === undefined) {
    return Effect.fail(unavailable(target.position, "referenced bin array is missing"));
  }
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return Effect.fail(
      unavailable(
        target.position,
        "referenced bin array is not owned by the pinned Meteora DLMM program",
      ),
    );
  }
  const decoded = decodeBinArray(row.bytes);
  if (decoded.status !== "decoded")
    return Effect.fail(unavailable(target.position, decoded.reason));
  if (decoded.layout.index !== target.index) {
    return Effect.fail(unavailable(target.position, "referenced bin array has the wrong index"));
  }
  if (decoded.layout.lbPair !== target.lbPair) {
    return Effect.fail(
      unavailable(target.position, "referenced bin array belongs to a different pair"),
    );
  }
  return Effect.succeed(decoded.layout);
};

/** @param {import("./meteora-dlmm-decode.js").MeteoraBinArrayLayout} layout @returns {BinSlots} */
const slotMap = (layout) => {
  /** @type {BinSlots} */
  const slots = new Map();
  const base = layout.index * BINS_PER_ARRAY;
  for (let offset = 0; offset < BINS_PER_ARRAY; offset += 1) {
    slots.set(base + offset, binSlot(layout, offset));
  }
  return slots;
};

/**
 * Fetch every occupied bin array once. The first position that names a failing array is blamed.
 * @param {AccountRead} read
 * @param {readonly FoundMeteora[]} found
 * @returns {Effect.Effect<BinCache, LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
export const readBins = (read, found) =>
  Effect.gen(function* () {
    const targets = yield* addressedBins(referencedBins(found));
    /** @type {BinCache} */
    const arrays = new Map();
    for (const chunk of chunksOf(targets, BATCH_CHUNK)) {
      const rows = yield* fetchAccounts(
        read,
        chunk.map((target) => target.address),
      );
      for (const [index, target] of chunk.entries()) {
        const layout = yield* guardedBinArray(target, rows[index]);
        arrays.set(binKey(target.lbPair, target.index), slotMap(layout));
      }
    }
    return arrays;
  });
