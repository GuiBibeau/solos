// @ts-check
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./liquidity-accounts.js").FetchedAccount} FetchedAccount */
import { LiquidityPositionUnavailable } from "@solos/core";
import { Effect } from "effect";
import { readMintLayout } from "../market/mint-account.js";
import { BATCH_CHUNK, chunksOf, fetchAccounts } from "./liquidity-accounts.js";

/** One guarded pool-mint read: decimals, or the fixed reason the account is not a usable mint. @typedef {{ readonly status: "ok"; readonly decimals: number } | { readonly status: "corrupt"; readonly reason: string }} MintRead */

/** @param {string} position @param {string} reason @returns {LiquidityPositionUnavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/** Map one guarded mint verdict to the slice's fixed failure class — never library output. @param {ReturnType<typeof readMintLayout>} layout @returns {string} */
const mintFailureReason = (layout) => {
  if (layout.verdict !== "not-a-mint") {
    return "pool mint account is too large to be a mint";
  }
  if (layout.reason.includes("owner")) {
    return "pool mint account is not owned by a token program";
  }
  if (layout.reason.includes("82 bytes")) {
    return "pool mint account has the wrong size for a mint";
  }
  return "pool mint account does not decode as an initialized mint";
};

/** Guard one fetched pool mint through the shared guarded mint decoder before any use. @param {FetchedAccount} row @returns {MintRead} */
const guardedMint = (row) => {
  const layout = readMintLayout({ owner: row.owner, data: row.bytes });
  return layout.verdict === "mint"
    ? { status: "ok", decimals: layout.decimals }
    : { status: "corrupt", reason: mintFailureReason(layout) };
};

/** Decode one chunk of guarded pool-mint reads, batched.
 * @param {AccountRead} read
 * @param {readonly string[]} chunk
 * @returns {Effect.Effect<Array<readonly [string, MintRead]>, import("@solos/core").RpcError>}
 */
const guardedMintChunk = (read, chunk) =>
  Effect.map(fetchAccounts(read, chunk), (rows) =>
    rows.flatMap((row, i) => {
      const mint = /** @type {string | undefined} */ (chunk[i]);
      return row === null || mint === undefined
        ? []
        : [/** @type {const} */ ([mint, guardedMint(row)])];
    }),
  );

/**
 * Guarded decimals for a list of pool mints, fetched in bounded chunks (decimals live on the
 * mint; the Whirlpool account carries none). Absent accounts are simply absent from the map,
 * so callers keep their position-attributed missing-mint failures; a present-but-unusable
 * mint carries its fixed failure class for the caller to raise as LiquidityPositionUnavailable.
 * @param {AccountRead} read
 * @param {readonly string[]} mints
 * @returns {Effect.Effect<Map<string, MintRead>, import("@solos/core").RpcError>}
 */
export const mintDecimals = (read, mints) =>
  Effect.flatMap(
    Effect.all(
      chunksOf(mints, BATCH_CHUNK).map((chunk) => guardedMintChunk(read, chunk)),
      { concurrency: 2 },
    ),
    (maps) => Effect.succeed(new Map(maps.flat())),
  );

/**
 * Resolve one guarded pool-mint read for a position: an absent account fails the missing
 * class, an unusable account fails its fixed class — both typed
 * LiquidityPositionUnavailable, never a raw decoder exception.
 * @param {string} position
 * @param {string} mint
 * @param {ReadonlyMap<string, MintRead>} reads
 * @returns {Effect.Effect<number, LiquidityPositionUnavailable>}
 */
export const mintDecimalsOrUnavailable = (position, mint, reads) => {
  const read0 = reads.get(mint);
  if (read0 === undefined) return Effect.fail(unavailable(position, "pool mint is missing"));
  if (read0.status === "corrupt") return Effect.fail(unavailable(position, read0.reason));
  return Effect.succeed(read0.decimals);
};

/**
 * Unwrap two guarded pool-mint reads for an enumerated position, or fail with the first
 * unusable mint's fixed class.
 * @param {string} position
 * @param {MintRead} a
 * @param {MintRead} b
 * @returns {Effect.Effect<{ readonly decimalsA: number; readonly decimalsB: number }, LiquidityPositionUnavailable>}
 */
export const usableMintPair = (position, a, b) => {
  if (a.status === "corrupt") return Effect.fail(unavailable(position, a.reason));
  if (b.status === "corrupt") return Effect.fail(unavailable(position, b.reason));
  return Effect.succeed({ decimalsA: a.decimals, decimalsB: b.decimals });
};
