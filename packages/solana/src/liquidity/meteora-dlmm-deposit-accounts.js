// @ts-check
/**
 * Accounts `add_liquidity2` names, derived from a guarded position. Nothing here signs.
 * Bin arrays the stored window already touches must exist; this slice does not initialize them
 * and does not widen the position.
 */
import { Effect } from "effect";
import {
  binArrayAddress,
  binArrayIndexOf,
  binOffset,
  bitmapExtensionAddress,
  eventAuthorityAddress,
} from "./meteora-dlmm-bins.js";
import { binSlot, decodeBinArray } from "./meteora-dlmm-decode.js";
import { isOutsideDefaultBitmap, METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";
import { ata } from "./raydium-clmm-plan-reads.js";

/**
 * Batched account rows. The plan stays pure over this seam.
 * @typedef {{
 *   rows: (accounts: readonly string[]) => import("effect").Effect.Effect<
 *     ReadonlyArray<{ owner: string; bytes: Uint8Array } | null | undefined>,
 *     import("@solos/core").RpcError>;
 * }} Reader
 */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejected */
/** @typedef {{ readonly status: "ok"; readonly reserveX: bigint; readonly reserveY: bigint }} ActiveReserves */

/** @param {string} reason @returns {Rejected} */
const reject = (reason) => ({ status: "reject", reason });

/** Indexes the stored window touches, ascending. @param {MeteoraPositionLayout} position */
export const windowIndexes = (position) => {
  const lower = binArrayIndexOf(position.lowerBinId);
  const upper = binArrayIndexOf(position.upperBinId);
  /** @type {number[]} */
  const indexes = [];
  for (let index = lower; index <= upper; index += 1) indexes.push(index);
  return indexes;
};

/**
 * @param {number} index
 * @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 * @param {string} lbPair
 */
export const guardArray = (index, row, lbPair) => {
  if (row === null || row === undefined) return reject("referenced bin array is missing");
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return reject("referenced bin array is not owned by the pinned Meteora DLMM program");
  }
  const decoded = decodeBinArray(row.bytes);
  if (decoded.status !== "decoded") return reject(decoded.reason);
  if (decoded.layout.index !== index) return reject("referenced bin array has the wrong index");
  if (decoded.layout.lbPair !== lbPair)
    return reject("referenced bin array belongs to a different pair");
  return { status: /** @type {const} */ ("ok"), layout: decoded.layout };
};

/**
 * Every bin array the range touches must already exist.
 * @param {Reader} reader
 * @param {string} lbPair
 * @param {readonly number[]} indexes
 */
export const requireBinArrays = (reader, lbPair, indexes) =>
  Effect.gen(function* () {
    const addresses = yield* Effect.promise(() =>
      Promise.all(indexes.map((index) => binArrayAddress(lbPair, index))),
    );
    const rows = yield* reader.rows(addresses);
    for (const [at, index] of indexes.entries()) {
      const guarded = guardArray(index, rows[at], lbPair);
      if (guarded.status === "reject") return guarded;
    }
    return { status: /** @type {const} */ ("ok"), addresses };
  });

/**
 * Reserves of the active bin when it sits inside the position. Outside the window the fit
 * does not use them. A missing array is a refusal: the deposit cannot invent one.
 * @param {{ reader: Reader; position: MeteoraPositionLayout; activeId: number }} input
 * @returns {import("effect").Effect.Effect<ActiveReserves | Rejected, import("@solos/core").RpcError>}
 */
export const activeReserves = ({ reader, position, activeId }) =>
  Effect.gen(function* () {
    if (activeId < position.lowerBinId || activeId > position.upperBinId) {
      return { status: /** @type {const} */ ("ok"), reserveX: 0n, reserveY: 0n };
    }
    return yield* reservesInWindow({ reader, position, activeId });
  });

/** @param {{ reader: Reader; position: MeteoraPositionLayout; activeId: number }} input */
const reservesInWindow = ({ reader, position, activeId }) =>
  Effect.gen(function* () {
    const index = binArrayIndexOf(activeId);
    const binArray = yield* Effect.promise(() => binArrayAddress(position.lbPair, index));
    const [row] = yield* reader.rows([binArray]);
    const guarded = guardArray(index, row, position.lbPair);
    if (guarded.status === "reject") return guarded;
    const slot = binSlot(guarded.layout, binOffset(activeId));
    return { status: /** @type {const} */ ("ok"), reserveX: slot.amountX, reserveY: slot.amountY };
  });

/**
 * @param {{ owner: string; positionAddress: string; position: MeteoraPositionLayout;
 *   pair: MeteoraPairLayout; programs: { tokenX: string; tokenY: string };
 *   binArrays: readonly string[] }} parts
 */
export const depositAccounts = async (parts) => {
  const { owner, positionAddress, position, pair, programs, binArrays } = parts;
  const isOverflow = windowIndexes(position).some((index) => isOutsideDefaultBitmap(index));
  const [userTokenX, userTokenY, bitmapExtension, eventAuthority] = await Promise.all([
    ata(owner, pair.tokenMintX, programs.tokenX),
    ata(owner, pair.tokenMintY, programs.tokenY),
    isOverflow ? bitmapExtensionAddress(position.lbPair) : Promise.resolve(METEORA_DLMM_PROGRAM),
    eventAuthorityAddress(),
  ]);
  return {
    position: positionAddress,
    lbPair: position.lbPair,
    bitmapExtension,
    userTokenX,
    userTokenY,
    reserveX: pair.reserveX,
    reserveY: pair.reserveY,
    tokenXMint: pair.tokenMintX,
    tokenYMint: pair.tokenMintY,
    sender: owner,
    tokenXProgram: programs.tokenX,
    tokenYProgram: programs.tokenY,
    eventAuthority,
    binArrays,
  };
};
