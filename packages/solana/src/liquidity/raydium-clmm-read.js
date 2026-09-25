// @ts-check
/**
 * Read one Raydium CLMM position, in protocol order: position guards, NFT custody proof, pool
 * guards, then the underlying math.
 *
 * Three bounded RPC reads rather than Orca's four — the pool carries both mint decimals, so no
 * separate mint fetch is needed. The underlying math is shared with Orca outright: both are
 * Uniswap-V3 concentrated liquidity over Q64.64 sqrt prices, so `underlyingAmounts` applies
 * unchanged and there is no second implementation to keep honest.
 *
 * Nothing here signs, sends, or prices.
 */
import { LiquidityPositionUnavailable, LpPositionSchema } from "@solos/core";
import { Effect } from "effect";
import { fetchAccount } from "../market/account-read.js";
import { base64AccountData } from "../market/mint-account.js";
import { holdsPositionNft } from "./liquidity-accounts.js";
import { decodePersonalPosition, decodePoolState } from "./raydium-clmm-decode.js";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";
import { underlyingAmounts } from "./whirlpool-underlying.js";

/** @typedef {import("@solos/core").LiquidityGetPositionRequest} LiquidityGetPositionRequest */
/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./raydium-clmm-decode.js").RaydiumPositionLayout} RaydiumPositionLayout */
/** @typedef {import("./raydium-clmm-decode.js").RaydiumPoolLayout} RaydiumPoolLayout */
/** @typedef {import("@solos/core").LiquidityPositionUnavailable} Unavailable */

/** @param {string} position @param {string} reason @returns {Unavailable} */
const unavailable = (position, reason) => new LiquidityPositionUnavailable({ position, reason });

/**
 * One guarded account read: present, owned by the pinned program, and decodable.
 * @template T
 * @param {AccountRead} read
 * @param {{ position: string; account: string; absent: string; foreign: string;
 *   decode: (bytes: Uint8Array | null) => { status: "decoded"; layout: T } | { status: "corrupt"; reason: string } }} parts
 * @returns {Effect.Effect<T, Unavailable | import("@solos/core").RpcError>}
 */
const guardedRead = (read, { position, account, absent, foreign, decode }) =>
  Effect.flatMap(fetchAccount(read, account), (info) => {
    if (info === null) return Effect.fail(unavailable(position, absent));
    if (info.owner !== RAYDIUM_CLMM_PROGRAM) return Effect.fail(unavailable(position, foreign));
    const guarded = decode(base64AccountData(info.data));
    return guarded.status === "decoded"
      ? Effect.succeed(guarded.layout)
      : Effect.fail(unavailable(position, guarded.reason));
  });

/**
 * Map one decoded position onto the merged `LpPosition` contract and re-parse it as the final
 * identity guard. Token 0/1 are Raydium's canonical order and map onto the contract's A/B.
 * @param {{ address: string; layout: RaydiumPositionLayout }} found
 * @param {RaydiumPoolLayout} pool
 * @returns {Effect.Effect<import("@solos/core").LpPosition, Unavailable>}
 */
export const toRaydiumLpPosition = (found, pool) => {
  const amounts = underlyingAmounts({
    sqrtPrice: pool.sqrtPrice,
    tickLowerIndex: found.layout.tickLowerIndex,
    tickUpperIndex: found.layout.tickUpperIndex,
    liquidity: found.layout.liquidity,
  });
  const parsed = LpPositionSchema.safeParse({
    kind: "lp",
    protocol: "raydium",
    position: found.address,
    instrument: found.layout.poolId,
    liquidity: found.layout.liquidity.toString(),
    tokenA: { mint: pool.tokenMint0, amount: amounts.amountA, decimals: pool.decimals0 },
    tokenB: { mint: pool.tokenMint1, amount: amounts.amountB, decimals: pool.decimals1 },
    valueUsd: null,
  });
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        unavailable(found.address, "decoded position does not satisfy the position contract"),
      );
};

/**
 * @param {AccountRead} read
 * @param {LiquidityGetPositionRequest} request
 * @returns {Effect.Effect<import("@solos/core").LpPosition, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const getRaydiumPositionLive = (read, request) =>
  Effect.gen(function* () {
    const layout = yield* guardedRead(read, {
      position: request.position,
      account: request.position,
      absent: "no account at the position address",
      foreign: "position account is not owned by the pinned Raydium CLMM program",
      decode: decodePersonalPosition,
    });
    // Ownership is proven the way the program proves it: custody of the position NFT.
    const held = yield* holdsPositionNft(read, request.owner, layout.nftMint);
    if (!held) {
      return yield* Effect.fail(
        unavailable(request.position, "owner does not hold the position NFT"),
      );
    }
    const pool = yield* guardedRead(read, {
      position: request.position,
      account: layout.poolId,
      absent: "referenced pool is missing",
      foreign: "referenced pool is not owned by the pinned Raydium CLMM program",
      decode: decodePoolState,
    });
    return yield* toRaydiumLpPosition({ address: request.position, layout }, pool);
  });
