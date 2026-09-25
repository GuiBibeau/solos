// @ts-check
/**
 * Enumerate one owner's Raydium CLMM positions.
 *
 * Candidate selection is shared with Orca and unchanged: an LP receipt is a token account
 * holding exactly one unit, which is true of any NFT-receipt CLMM. What differs is the PDA the
 * candidate mint derives to and the account it decodes as, so only those two steps are here.
 *
 * Complete or failed, never partial: an absent PDA is an unrelated NFT and is skipped, but a
 * present account that does not decode fails the whole enumeration (CONTEXT.md, "Complete
 * enumeration").
 */
import { LiquidityEnumerationIncomplete, LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { BATCH_CHUNK, chunksOf, fetchAccounts, ownedTokenAccounts } from "./liquidity-accounts.js";
import { selectPositionCandidates } from "./liquidity-enumerate-select.js";
import {
  decodePersonalPosition,
  decodePoolState,
  personalPositionAddress,
} from "./raydium-clmm-decode.js";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";
import { toRaydiumLpPosition } from "./raydium-clmm-read.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./raydium-clmm-decode.js").RaydiumPositionLayout} RaydiumPositionLayout */
/** @typedef {import("./raydium-clmm-decode.js").RaydiumPoolLayout} RaydiumPoolLayout */
/** @typedef {{ readonly address: string; readonly layout: RaydiumPositionLayout }} FoundRaydium */

/** @param {string} position @param {string} reason */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/**
 * Decode one chunk of candidate mints into positions.
 * @param {AccountRead} read @param {readonly string[]} mints
 * @returns {Effect.Effect<FoundRaydium[], LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
const readChunk = (read, mints) =>
  Effect.gen(function* () {
    const pdas = yield* Effect.promise(() => Promise.all(mints.map(personalPositionAddress)));
    const rows = yield* fetchAccounts(read, pdas);
    /** @type {FoundRaydium[]} */
    const found = [];
    for (const [index, row] of rows.entries()) {
      const address = pdas[index];
      // An absent PDA belongs to an unrelated NFT and is skipped, like the official scan.
      if (row === null || row === undefined || address === undefined) continue;
      if (row.owner !== RAYDIUM_CLMM_PROGRAM) {
        return yield* Effect.fail(
          unavailable(address, "position account is not owned by the pinned Raydium CLMM program"),
        );
      }
      const guarded = decodePersonalPosition(row.bytes);
      if (guarded.status !== "decoded") {
        return yield* Effect.fail(unavailable(address, guarded.reason));
      }
      found.push({ address, layout: guarded.layout });
    }
    return found;
  });

/**
 * One fetched pool row, guarded exactly as the point read guards it. The ownership check is the
 * point: without it, discriminator-shaped bytes in a foreign account decode into fabricated mints
 * and amounts instead of a typed refusal.
 * @param {string} position @param {{ owner: string; bytes: Uint8Array } | null | undefined} row
 * @returns {Effect.Effect<RaydiumPoolLayout, LiquidityPositionUnavailable>}
 */
const guardedPool = (position, row) => {
  if (row === null || row === undefined) {
    return Effect.fail(unavailable(position, "referenced pool is missing"));
  }
  if (row.owner !== RAYDIUM_CLMM_PROGRAM) {
    return Effect.fail(
      unavailable(position, "referenced pool is not owned by the pinned Raydium CLMM program"),
    );
  }
  const guarded = decodePoolState(row.bytes);
  return guarded.status === "decoded"
    ? Effect.succeed(guarded.layout)
    : Effect.fail(unavailable(position, guarded.reason));
};

/**
 * Fetch every referenced pool once, batched. The first position referencing a failing pool
 * carries the typed error.
 * @param {AccountRead} read @param {FoundRaydium[]} found
 * @returns {Effect.Effect<Map<string, RaydiumPoolLayout>, LiquidityPositionUnavailable | import("@solos/core").RpcError>}
 */
const readPools = (read, found) =>
  Effect.gen(function* () {
    /** @type {Map<string, string>} The position to blame when a pool fails, by pool. */
    const referrer = new Map();
    /** @type {string[]} */
    const poolAddresses = [];
    for (const item of found) {
      if (referrer.has(item.layout.poolId)) continue;
      referrer.set(item.layout.poolId, item.address);
      poolAddresses.push(item.layout.poolId);
    }
    /** @type {Map<string, RaydiumPoolLayout>} */
    const pools = new Map();
    for (const chunk of chunksOf(poolAddresses, BATCH_CHUNK)) {
      const rows = yield* fetchAccounts(read, chunk);
      for (const [index, pool] of chunk.entries()) {
        const position = /** @type {string} */ (referrer.get(pool));
        pools.set(pool, yield* guardedPool(position, rows[index]));
      }
    }
    return pools;
  });

/**
 * @param {AccountRead} read
 * @param {import("@solos/core").LiquidityListPositionsRequest} request
 * @returns {Effect.Effect<import("@solos/core").LiquidityEnumeration, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const listRaydiumPositionsLive = (read, request) =>
  Effect.gen(function* () {
    const accounts = yield* ownedTokenAccounts(read, request.owner);
    const selection = selectPositionCandidates(accounts);
    if (selection.status === "incomplete") {
      return yield* new LiquidityEnumerationIncomplete({ reason: selection.reason });
    }
    const chunks = yield* Effect.forEach(selection.chunks, (mints) => readChunk(read, mints));
    const found = chunks.flat();
    const pools = yield* readPools(read, found);
    const positions = yield* Effect.forEach(found, (item) => {
      const pool = pools.get(item.layout.poolId);
      return pool === undefined
        ? Effect.fail(unavailable(item.address, "referenced pool is missing"))
        : toRaydiumLpPosition(item, pool);
    });
    return {
      positions,
      perpAccounts: [],
      receiptMints: found.map((item) => item.layout.nftMint),
    };
  });
