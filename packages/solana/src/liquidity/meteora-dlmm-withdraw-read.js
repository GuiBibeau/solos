// @ts-check
/**
 * Position and bin-array reads for a Meteora removal. Identity is the PositionV2
 * account: the signer must match `owner` at byte 40. There is no NFT.
 */
import { Effect } from "effect";
import { binArrayAddress, binArrayIndexOf, binOffset } from "./meteora-dlmm-bins.js";
import { binSlot, decodePositionV2 } from "./meteora-dlmm-decode.js";
import { guardArray } from "./meteora-dlmm-deposit-accounts.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** @typedef {import("./meteora-dlmm-deposit-accounts.js").Reader} Reader */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraBinSlot} MeteoraBinSlot */
/** @typedef {import("./meteora-dlmm-withdraw-math.js").ShareBin} ShareBin */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejected */
/** @param {string} reason @returns {Rejected} */
const reject = (reason) => ({ status: "reject", reason });

/**
 * @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 * @param {string} absent
 * @param {string} foreign
 */
const programRow = (row, absent, foreign) => {
  if (row === null || row === undefined) return reject(absent);
  if (row.owner !== METEORA_DLMM_PROGRAM) return reject(foreign);
  return { status: /** @type {const} */ ("ok"), bytes: row.bytes };
};

/** @param {Uint8Array} bytes @param {string} owner */
const decodedOwner = (bytes, owner) => {
  const decoded = decodePositionV2(bytes);
  if (decoded.status !== "decoded") return reject(decoded.reason);
  if (decoded.layout.owner !== owner) return reject("the signer does not own this position");
  return { status: /** @type {const} */ ("ok"), layout: decoded.layout };
};

/**
 * The signer must own the position account. The pair is whatever the position already names.
 * @param {{ reader: Reader; position: string; owner: string }} input
 */
export const ownedMeteoraPosition = ({ reader, position, owner }) =>
  Effect.gen(function* () {
    const [row] = yield* reader.rows([position]);
    const held = programRow(
      row,
      "no account at the position address",
      "position account is not owned by the pinned Meteora DLMM program",
    );
    if (held.status === "reject") return held;
    return decodedOwner(held.bytes, owner);
  });

/** Ascending bin-array indexes the bins touch, each once. @param {readonly { binId: number }[]} bins */
export const indexesOfBins = (bins) => {
  /** @type {number[]} */
  const indexes = [];
  for (const bin of bins) {
    const index = binArrayIndexOf(bin.binId);
    if (!indexes.includes(index)) indexes.push(index);
  }
  return indexes.toSorted((left, right) => left - right);
};

/**
 * @param {Map<number, MeteoraBinSlot>} slots
 * @param {import("./meteora-dlmm-decode.js").MeteoraBinArrayLayout} layout
 * @param {readonly ShareBin[]} bins
 */
const stampSlots = (slots, layout, bins) => {
  for (const bin of bins) {
    if (binArrayIndexOf(bin.binId) !== layout.index) continue;
    slots.set(bin.binId, binSlot(layout, binOffset(bin.binId)));
  }
};

/**
 * @param {{ lbPair: string; indexes: readonly number[]; addresses: readonly string[];
 *   rows: ReadonlyArray<{ owner: string; bytes: Uint8Array } | null | undefined>;
 *   bins: readonly ShareBin[] }} parts
 */
const readSlots = ({ lbPair, indexes, addresses, rows, bins }) => {
  /** @type {Map<number, string>} */
  const addressOf = new Map();
  /** @type {Map<number, MeteoraBinSlot>} */
  const slots = new Map();
  for (const [at, index] of indexes.entries()) {
    const guarded = guardArray(index, rows[at], lbPair);
    if (guarded.status === "reject") return guarded;
    const found = addresses[at];
    if (found === undefined) return reject("referenced bin array is missing");
    addressOf.set(index, found);
    stampSlots(slots, guarded.layout, bins);
  }
  return {
    status: /** @type {const} */ ("ok"),
    addressOf,
    slotFor: (/** @type {number} */ binId) => slots.get(binId),
  };
};

/**
 * Every occupied bin's array must already exist. This slice does not initialize one.
 * @param {Reader} reader
 * @param {string} lbPair
 * @param {readonly ShareBin[]} bins
 */
export const slotsForOccupied = (reader, lbPair, bins) =>
  Effect.gen(function* () {
    const indexes = indexesOfBins(bins);
    const addresses = yield* Effect.promise(() =>
      Promise.all(indexes.map((index) => binArrayAddress(lbPair, index))),
    );
    const rows = yield* reader.rows(addresses);
    return readSlots({ lbPair, indexes, addresses, rows, bins });
  });
