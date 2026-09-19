// @ts-check
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./whirlpool-decode.js").WhirlpoolLayout} WhirlpoolLayout */
/** @typedef {import("./liquidity-accounts.js").FetchedAccount} FetchedAccount */
/** @typedef {import("./liquidity-read.js").FoundPosition} FoundPosition */
import { LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { BATCH_CHUNK, chunksOf, fetchAccounts } from "./liquidity-accounts.js";
import { decodePosition, decodeWhirlpool, positionAddress } from "./whirlpool-decode.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";

/** @param {string} position @param {string} reason @returns {LiquidityPositionUnavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/** Derive the position PDAs for one chunk of candidate mints — pure, offline. @param {readonly string[]} mints */
const deriveAddresses = (mints) => Effect.promise(() => Promise.all(mints.map(positionAddress)));

/** Guard one fetched candidate account under the same rules as the point read. @param {string} address @param {string} mint @param {FetchedAccount} row @returns {Effect.Effect<FoundPosition, LiquidityPositionUnavailable>} */
const guardedCandidate = (address, mint, row) => {
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return Effect.fail(
      unavailable(address, "position account is not owned by the pinned Whirlpool program"),
    );
  }
  const guarded = decodePosition(row.bytes);
  return guarded.status === "decoded"
    ? Effect.succeed({ address, mint, layout: guarded.layout })
    : Effect.fail(unavailable(address, guarded.reason));
};

/**
 * Decode one chunk of candidate PDAs. Absent PDAs belong to unrelated NFTs and are
 * skipped, exactly like the official enumeration; a present-but-wrong account fails the
 * whole enumeration — complete or typed error, never a silent partial array.
 * @param {AccountRead} read
 * @param {readonly string[]} mints
 * @returns {Effect.Effect<FoundPosition[], LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
const readCandidateChunk = (read, mints) =>
  Effect.gen(function* () {
    /** @type {FoundPosition[]} */
    const found = [];
    const pdas = yield* deriveAddresses(mints);
    const rows = yield* fetchAccounts(read, pdas);
    for (const [i, row] of rows.entries()) {
      const address = /** @type {string | undefined} */ (pdas[i]);
      const mint = /** @type {string | undefined} */ (mints[i]);
      // An absent PDA belongs to an unrelated NFT and is skipped, like the official scan.
      if (row === null || row === undefined || address === undefined || mint === undefined) {
        continue;
      }
      found.push(yield* guardedCandidate(address, mint, row));
    }
    return found;
  });

/**
 * Decode every candidate chunk, batched.
 * @param {AccountRead} read
 * @param {ReadonlyArray<readonly string[]>} chunks
 * @returns {Effect.Effect<FoundPosition[], LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
export const readCandidates = (read, chunks) =>
  Effect.map(
    Effect.forEach(chunks, (mints) => readCandidateChunk(read, mints)),
    (groups) => groups.flat(),
  );

/** Guard one fetched pool row under the same rules as the point read. @param {string} position @param {string} pool @param {FetchedAccount | null} row @returns {Effect.Effect<readonly [string, WhirlpoolLayout], LiquidityPositionUnavailable>} */
const guardedPool = (position, pool, row) => {
  if (row === null) return Effect.fail(unavailable(position, "referenced pool is missing"));
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return Effect.fail(
      unavailable(position, "referenced pool is not owned by the pinned Whirlpool program"),
    );
  }
  const guarded = decodeWhirlpool(row.bytes);
  return guarded.status === "decoded"
    ? Effect.succeed([pool, guarded.layout])
    : Effect.fail(unavailable(position, guarded.reason));
};

/** Fetch and guard one pool chunk into `pools`. @param {AccountRead} read @param {{ referrer: Map<string, string>; pools: Map<string, WhirlpoolLayout> } } state @param {readonly string[]} chunk @returns {Effect.Effect<void, LiquidityPositionUnavailable | import("@solos/core").RpcError>} */
const readPoolChunk = (read, state, chunk) =>
  Effect.flatMap(fetchAccounts(read, chunk), (rows) =>
    Effect.forEach(chunk, (pool, i) =>
      Effect.map(
        guardedPool(
          /** @type {string} */ (state.referrer.get(pool)),
          pool,
          /** @type {FetchedAccount | null} */ (rows[i] ?? null),
        ),
        ([address, layout]) => state.pools.set(address, layout),
      ),
    ),
  ).pipe(Effect.asVoid);

/**
 * Fetch every referenced pool once, batched; the first position referencing a failing pool
 * carries the typed error.
 * @param {AccountRead} read
 * @param {FoundPosition[]} found
 * @returns {Effect.Effect<Map<string, WhirlpoolLayout>, LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
export const readPools = (read, found) =>
  Effect.gen(function* () {
    /** @type {Map<string, string>} */
    const referrer = new Map();
    /** @type {Set<string>} */
    const addresses = new Set();
    for (const item of found) {
      if (referrer.has(item.layout.whirlpool)) continue;
      referrer.set(item.layout.whirlpool, item.address);
      addresses.add(item.layout.whirlpool);
    }
    /** @type {Map<string, WhirlpoolLayout>} */
    const pools = new Map();
    const poolChunks = chunksOf([...addresses], BATCH_CHUNK);
    for (const chunk of poolChunks) {
      yield* readPoolChunk(read, { referrer, pools }, chunk);
    }
    return pools;
  });
