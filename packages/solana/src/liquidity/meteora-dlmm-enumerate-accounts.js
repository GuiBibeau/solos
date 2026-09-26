// @ts-check
/**
 * Batched follow-up reads for one Meteora enumeration.
 *
 * Pairs and mint decimals are collected across every decoded PositionV2, then fetched
 * once in `BATCH_CHUNK` groups. Occupied bin arrays are fetched the same way. A shared
 * pair is not read again per position. The first position that references a bad account
 * fails the whole enumeration; a partial list is never returned.
 */
import { LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { BATCH_CHUNK, chunksOf, fetchAccounts } from "./liquidity-accounts.js";
import { mintDecimals, mintDecimalsOrUnavailable } from "./liquidity-mint-read.js";
import { binArrayIndexOf, sumBinAmounts } from "./meteora-dlmm-bins.js";
import { decodeLbPair } from "./meteora-dlmm-decode.js";
import { binKey, readBins } from "./meteora-dlmm-enumerate-bins.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";
import { toMeteoraLpPosition } from "./meteora-dlmm-read.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {import("./liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {{ readonly address: string; readonly layout: MeteoraPositionLayout }} FoundMeteora */
/** @typedef {import("./meteora-dlmm-enumerate-bins.js").BinCache} BinCache */
/** @typedef {{ referrer: Map<string, string>; mints: string[] }} MintIndex */
/** @typedef {{ readonly pairs: ReadonlyMap<string, MeteoraPairLayout>; readonly arrays: BinCache; readonly decimals: ReadonlyMap<string, import("./liquidity-mint-read.js").MintRead> }} PositionCache */

/** @param {string} position @param {string} reason */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/**
 * @param {string} position
 * @param {FetchedAccount | null | undefined} row
 * @returns {Effect.Effect<MeteoraPairLayout, LiquidityPositionUnavailable>}
 */
const guardedPair = (position, row) => {
  if (row === null || row === undefined) {
    return Effect.fail(unavailable(position, "referenced pair is missing"));
  }
  if (row.owner !== METEORA_DLMM_PROGRAM) {
    return Effect.fail(
      unavailable(position, "referenced pair is not owned by the pinned Meteora DLMM program"),
    );
  }
  const guarded = decodeLbPair(row.bytes);
  return guarded.status === "decoded"
    ? Effect.succeed(guarded.layout)
    : Effect.fail(unavailable(position, guarded.reason));
};

/**
 * Fetch every referenced pair once. The first position that names a failing pair is blamed.
 * @param {AccountRead} read
 * @param {readonly FoundMeteora[]} found
 * @returns {Effect.Effect<Map<string, MeteoraPairLayout>, LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
const readPairs = (read, found) =>
  Effect.gen(function* () {
    /** @type {Map<string, string>} */
    const referrer = new Map();
    /** @type {string[]} */
    const addresses = [];
    for (const item of found) {
      if (referrer.has(item.layout.lbPair)) continue;
      referrer.set(item.layout.lbPair, item.address);
      addresses.push(item.layout.lbPair);
    }
    /** @type {Map<string, MeteoraPairLayout>} */
    const pairs = new Map();
    for (const chunk of chunksOf(addresses, BATCH_CHUNK)) {
      const rows = yield* fetchAccounts(read, chunk);
      for (const [index, pair] of chunk.entries()) {
        const position = /** @type {string} */ (referrer.get(pair));
        pairs.set(pair, yield* guardedPair(position, rows[index]));
      }
    }
    return pairs;
  });

/**
 * @param {MintIndex} state
 * @param {string} mint
 * @param {string} position
 */
const rememberMint = (state, mint, position) => {
  if (state.referrer.has(mint)) return;
  state.referrer.set(mint, position);
  state.mints.push(mint);
};

/**
 * @param {readonly FoundMeteora[]} found
 * @param {ReadonlyMap<string, MeteoraPairLayout>} pairs
 */
const collectMints = (found, pairs) => {
  /** @type {MintIndex} */
  const state = { referrer: new Map(), mints: [] };
  for (const item of found) {
    const pair = pairs.get(item.layout.lbPair);
    if (pair === undefined) continue;
    rememberMint(state, pair.tokenMintX, item.address);
    rememberMint(state, pair.tokenMintY, item.address);
  }
  return state;
};

/**
 * @param {string} position
 * @param {MeteoraPositionLayout} layout
 * @param {BinCache} arrays
 */
const amountsFor = (position, layout, arrays) => {
  if (layout.bins.length === 0) return Effect.succeed({ amountX: 0n, amountY: 0n });
  const summed = sumBinAmounts(layout.bins, (binId) =>
    arrays.get(binKey(layout.lbPair, binArrayIndexOf(binId)))?.get(binId),
  );
  if (summed.status !== "ok") return Effect.fail(unavailable(position, summed.reason));
  return Effect.succeed({ amountX: summed.amountX, amountY: summed.amountY });
};

/**
 * @param {FoundMeteora} item
 * @param {PositionCache} cache
 */
const onePosition = (item, cache) =>
  Effect.gen(function* () {
    const pair = cache.pairs.get(item.layout.lbPair);
    if (pair === undefined) {
      return yield* Effect.fail(unavailable(item.address, "referenced pair is missing"));
    }
    const amounts = yield* amountsFor(item.address, item.layout, cache.arrays);
    const decimalsX = yield* mintDecimalsOrUnavailable(
      item.address,
      pair.tokenMintX,
      cache.decimals,
    );
    const decimalsY = yield* mintDecimalsOrUnavailable(
      item.address,
      pair.tokenMintY,
      cache.decimals,
    );
    return yield* toMeteoraLpPosition(item.address, {
      layout: item.layout,
      pair,
      amounts,
      decimals: { decimalsX, decimalsY },
    });
  });

/**
 * Build every LP position from shared pair, bin-array, and mint caches.
 * @param {AccountRead} read
 * @param {readonly FoundMeteora[]} found
 * @returns {Effect.Effect<import("@solos/core").LpPosition[], LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
export const positionsFromFound = (read, found) =>
  Effect.gen(function* () {
    const pairs = yield* readPairs(read, found);
    const arrays = yield* readBins(read, found);
    const { mints, referrer } = collectMints(found, pairs);
    const decimals = yield* mintDecimals(read, mints);
    yield* Effect.forEach(
      [...referrer],
      ([mint, position]) => mintDecimalsOrUnavailable(position, mint, decimals),
      { concurrency: 1 },
    );
    return yield* Effect.forEach(found, (item) => onePosition(item, { pairs, arrays, decimals }), {
      concurrency: 1,
    });
  });
