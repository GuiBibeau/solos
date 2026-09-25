// @ts-check
/** @typedef {import("@solos/core").LiquidityGetPositionRequest} LiquidityGetPositionRequest */
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./whirlpool-decode.js").PositionLayout} PositionLayout */
/** @typedef {import("./whirlpool-decode.js").WhirlpoolLayout} WhirlpoolLayout */
/** @typedef {import("@solos/core").LiquidityPositionUnavailable} Unavailable */
import {
  LpPositionSchema,
  LiquidityPositionUnavailable,
  LiquidityUnsupportedProtocol,
} from "@solos/core";
import { Effect } from "effect";
import { fetchAccount } from "../market/account-read.js";
import { base64AccountData } from "../market/mint-account.js";
import { holdsPositionNft } from "./liquidity-accounts.js";
import { mintDecimals, mintDecimalsOrUnavailable } from "./liquidity-mint-read.js";
import { getRaydiumPositionLive } from "./raydium-clmm-read.js";
import { decodePosition, decodeWhirlpool } from "./whirlpool-decode.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";
import { underlyingAmounts } from "./whirlpool-underlying.js";

/** @param {string} position @param {string} reason @returns {Unavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/** One decoded position found by a read or an enumeration: PDA, receipt mint, layout. @typedef {{ readonly address: string; readonly mint: string; readonly layout: PositionLayout }} FoundPosition */

/** Wraps a pure guard verdict so a typed unavailable error becomes the effect's error channel. @param {string} position @param {ReturnType<typeof decodePosition>} guarded @returns {Effect.Effect<PositionLayout, Unavailable>} */
const positionLayout = (position, guarded) =>
  guarded.status === "decoded"
    ? Effect.succeed(guarded.layout)
    : Effect.fail(unavailable(position, guarded.reason));

/**
 * The position half of the read: absent, foreign-program, or corrupt data is a typed
 * unavailable error at the first failing guard — never a fabricated zero holding.
 * @param {AccountRead} read
 * @param {string} position
 * @returns {Effect.Effect<PositionLayout, Unavailable | import("@solos/core").RpcError>}
 */
const readPosition = (read, position) =>
  Effect.flatMap(fetchAccount(read, position), (info) => {
    if (info === null) {
      return Effect.fail(unavailable(position, "no account at the position address"));
    }
    if (info.owner !== WHIRLPOOL_PROGRAM) {
      return Effect.fail(
        unavailable(position, "position account is not owned by the pinned Whirlpool program"),
      );
    }
    return positionLayout(position, decodePosition(base64AccountData(info.data)));
  });

/**
 * Ownership is proven exactly the way the program proves it: the owner's custody of the
 * position NFT (one token account, amount 1). A transferred NFT reads as unavailable.
 * @param {AccountRead} read
 * @param {LiquidityGetPositionRequest} request
 * @param {string} positionMint
 * @returns {Effect.Effect<void, Unavailable | import("@solos/core").RpcError>}
 */
const custodyProof = (read, request, positionMint) =>
  Effect.flatMap(holdsPositionNft(read, request.owner, positionMint), (held) =>
    held
      ? Effect.void
      : Effect.fail(unavailable(request.position, "owner does not hold the position NFT")),
  );

/**
 * The pool half of the read: the position references its Whirlpool; a missing or corrupt
 * pool is unavailable at the same guards as the position itself.
 * @param {AccountRead} read
 * @param {string} position
 * @param {string} pool
 * @returns {Effect.Effect<WhirlpoolLayout, Unavailable | import("@solos/core").RpcError>}
 */
const readPool = (read, position, pool) =>
  Effect.flatMap(fetchAccount(read, pool), (info) => {
    if (info === null) return Effect.fail(unavailable(position, "referenced pool is missing"));
    if (info.owner !== WHIRLPOOL_PROGRAM) {
      return Effect.fail(
        unavailable(position, "referenced pool is not owned by the pinned Whirlpool program"),
      );
    }
    const guarded = decodeWhirlpool(base64AccountData(info.data));
    return guarded.status === "decoded"
      ? Effect.succeed(guarded.layout)
      : Effect.fail(unavailable(position, guarded.reason));
  });

/**
 * Map one decoded position onto the merged `LpPosition` contract — exact decimal strings,
 * null valuation — and re-parse it as the final identity guard.
 * @param {FoundPosition} found
 * @param {WhirlpoolLayout} pool
 * @param {{ readonly decimalsA: number; readonly decimalsB: number }} decimals
 * @returns {Effect.Effect<import("@solos/core").LpPosition, Unavailable>}
 */
export const toLpPosition = (found, pool, decimals) => {
  const amounts = underlyingAmounts({
    sqrtPrice: pool.sqrtPrice,
    tickLowerIndex: found.layout.tickLowerIndex,
    tickUpperIndex: found.layout.tickUpperIndex,
    liquidity: found.layout.liquidity,
  });
  const parsed = LpPositionSchema.safeParse({
    kind: "lp",
    protocol: "orca",
    position: found.address,
    instrument: found.layout.whirlpool,
    liquidity: found.layout.liquidity.toString(),
    tokenA: { mint: pool.tokenMintA, amount: amounts.amountA, decimals: decimals.decimalsA },
    tokenB: { mint: pool.tokenMintB, amount: amounts.amountB, decimals: decimals.decimalsB },
    valueUsd: null,
  });
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        unavailable(found.address, "decoded position does not satisfy the position contract"),
      );
};

/**
 * The whole point read in protocol order. Raydium has its own adapter and dispatches first;
 * what follows is Orca's: position guards, NFT custody proof, pool guards, mint decimals, then
 * the pinned underlying math. At most four bounded RPC reads happen; nothing is signed or sent.
 * @param {AccountRead} read
 * @param {LiquidityGetPositionRequest} request
 * @returns {Effect.Effect<import("@solos/core").LpPosition, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const getPositionLive = (read, request) =>
  Effect.gen(function* () {
    if (request.protocol === "raydium") return yield* getRaydiumPositionLive(read, request);
    if (request.protocol !== "orca") {
      return yield* new LiquidityUnsupportedProtocol({ protocol: request.protocol });
    }
    const layout = yield* readPosition(read, request.position);
    yield* custodyProof(read, request, layout.positionMint);
    const pool = yield* readPool(read, request.position, layout.whirlpool);
    const reads = yield* mintDecimals(read, [pool.tokenMintA, pool.tokenMintB]);
    const decimalsA = yield* mintDecimalsOrUnavailable(request.position, pool.tokenMintA, reads);
    const decimalsB = yield* mintDecimalsOrUnavailable(request.position, pool.tokenMintB, reads);
    const found = { address: request.position, mint: layout.positionMint, layout };
    return yield* toLpPosition(found, pool, { decimalsA, decimalsB });
  });
