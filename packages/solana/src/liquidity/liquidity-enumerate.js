// @ts-check
/** @typedef {import("@solos/core").LiquidityListPositionsRequest} LiquidityListPositionsRequest */
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./whirlpool-decode.js").WhirlpoolLayout} WhirlpoolLayout */
/** @typedef {import("./liquidity-read.js").FoundPosition} FoundPosition */
import {
  LiquidityEnumerationIncomplete,
  LiquidityPositionUnavailable,
  LiquidityUnsupportedProtocol,
} from "@solos/core";
import { Effect } from "effect";
import { ownedTokenAccounts } from "./liquidity-accounts.js";
import { readCandidates, readPools } from "./liquidity-enumerate-accounts.js";
import { selectPositionCandidates } from "./liquidity-enumerate-select.js";
import { mintDecimals, usableMintPair } from "./liquidity-mint-read.js";
import { toLpPosition } from "./liquidity-read.js";

/** @param {string} position @param {string} reason @returns {LiquidityPositionUnavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/**
 * Map every found position onto the contract; a referenced pool mint that never resolved is
 * a typed failure, not a zero. The envelope is the ADR-0018 shape: this venue holds no perp
 * exposure, and the receipt mints are the position NFTs themselves.
 * @param {FoundPosition[]} found
 * @param {Map<string, WhirlpoolLayout>} pools
 * @param {Map<string, import("./liquidity-mint-read.js").MintRead>} decimals
 * @returns {Effect.Effect<import("@solos/core").LiquidityEnumeration, LiquidityPositionUnavailable>}
 */
const toEnumeration = (found, pools, decimals) =>
  Effect.forEach(found, (item) => {
    const pool = pools.get(item.layout.whirlpool);
    const decimalsA = pool === undefined ? undefined : decimals.get(pool.tokenMintA);
    const decimalsB = pool === undefined ? undefined : decimals.get(pool.tokenMintB);
    if (pool === undefined || decimalsA === undefined || decimalsB === undefined) {
      return Effect.fail(unavailable(item.address, "referenced pool mint is missing"));
    }
    return Effect.flatMap(usableMintPair(item.address, decimalsA, decimalsB), (decimals) =>
      toLpPosition(item, pool, decimals),
    );
  }).pipe(
    Effect.map((positions) => ({
      positions,
      perpAccounts: [],
      receiptMints: found.map((item) => item.layout.positionMint),
    })),
  );

/**
 * The whole enumeration in protocol order: defensive protocol gate, token accounts across
 * both token programs, pure candidate selection with the ADR-0018 bounds, batched position
 * reads, batched pool reads, batched mint decimals, then the pinned math per position.
 * Complete or failed — a bound raises LiquidityEnumerationIncomplete, never a partial array.
 * @param {AccountRead} read
 * @param {LiquidityListPositionsRequest} request
 * @returns {Effect.Effect<import("@solos/core").LiquidityEnumeration, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const listPositionsLive = (read, request) =>
  Effect.gen(function* () {
    if (request.protocol !== "orca") {
      return yield* new LiquidityUnsupportedProtocol({ protocol: request.protocol });
    }
    const accounts = yield* ownedTokenAccounts(read, request.owner);
    const selection = selectPositionCandidates(accounts);
    if (selection.status === "incomplete") {
      return yield* new LiquidityEnumerationIncomplete({ reason: selection.reason });
    }
    const found = yield* readCandidates(read, selection.chunks);
    const pools = yield* readPools(read, found);
    /** @type {Set<string>} */
    const mints = new Set();
    for (const pool of pools.values()) {
      mints.add(pool.tokenMintA);
      mints.add(pool.tokenMintB);
    }
    const decimals = yield* mintDecimals(read, [...mints]);
    return yield* toEnumeration(found, pools, decimals);
  });
