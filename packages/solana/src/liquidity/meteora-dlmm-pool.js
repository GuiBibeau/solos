// @ts-check
/**
 * Read one Meteora LbPair: the pair account, its two mint decimals, and the active-bin price.
 * Nothing here signs or sends. The decoder is the one deposits already use.
 */
import { LiquidityPoolUnavailable, PoolStateSchema } from "@solos/core";
import { Effect } from "effect";
import { fetchAccount } from "../market/account-read.js";
import { base64AccountData } from "../market/mint-account.js";
import { mintDecimals, mintDecimalsOrUnavailable } from "./liquidity-mint-read.js";
import { decodeLbPair } from "./meteora-dlmm-decode.js";
import { priceAPerB } from "./meteora-dlmm-pool-price.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {import("@solos/core").LiquidityGetPoolRequest} LiquidityGetPoolRequest */

/** @param {string} pool @param {string} reason */
const unavailable = (pool, reason) => new LiquidityPoolUnavailable({ pool, reason });

/**
 * @param {AccountRead} read
 * @param {string} pool
 * @returns {import("effect").Effect.Effect<MeteoraPairLayout, import("@solos/core").LiquidityPoolUnavailable | import("@solos/core").RpcError>}
 */
const readPair = (read, pool) =>
  Effect.flatMap(fetchAccount(read, pool), (info) => {
    if (info === null) return Effect.fail(unavailable(pool, "no account at the pool address"));
    if (info.owner !== METEORA_DLMM_PROGRAM) {
      return Effect.fail(
        unavailable(pool, "pool account is not owned by the pinned Meteora DLMM program"),
      );
    }
    const guarded = decodeLbPair(base64AccountData(info.data));
    return guarded.status === "decoded"
      ? Effect.succeed(guarded.layout)
      : Effect.fail(unavailable(pool, guarded.reason));
  });

/**
 * @param {AccountRead} read
 * @param {string} pool
 * @param {MeteoraPairLayout} pair
 */
const decimalsOf = (read, pool, pair) =>
  Effect.gen(function* () {
    const reads = yield* mintDecimals(read, [pair.tokenMintX, pair.tokenMintY]);
    const decimalsX = yield* mintDecimalsOrUnavailable(pool, pair.tokenMintX, reads).pipe(
      Effect.mapError((error) => unavailable(pool, error.reason)),
    );
    const decimalsY = yield* mintDecimalsOrUnavailable(pool, pair.tokenMintY, reads).pipe(
      Effect.mapError((error) => unavailable(pool, error.reason)),
    );
    return { decimalsX, decimalsY };
  });

/**
 * @param {AccountRead} read
 * @param {LiquidityGetPoolRequest} request
 * @returns {import("effect").Effect.Effect<import("@solos/core").PoolState, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const getMeteoraPoolLive = (read, request) =>
  Effect.gen(function* () {
    const pair = yield* readPair(read, request.pool);
    const decimals = yield* decimalsOf(read, request.pool, pair);
    const price = priceAPerB({
      activeId: pair.activeId,
      binStep: pair.binStep,
      decimalsA: decimals.decimalsX,
      decimalsB: decimals.decimalsY,
    });
    if (price === null) {
      return yield* unavailable(request.pool, "the active bin price is not representable");
    }
    const parsed = PoolStateSchema.safeParse({
      protocol: "meteora",
      pool: request.pool,
      tokenA: { mint: pair.tokenMintX, decimals: decimals.decimalsX },
      tokenB: { mint: pair.tokenMintY, decimals: decimals.decimalsY },
      activeId: pair.activeId,
      binStep: pair.binStep,
      priceAPerB: price,
      at: new Date().toISOString(),
    });
    if (!parsed.success) {
      return yield* unavailable(request.pool, "decoded pool does not satisfy the pool contract");
    }
    return parsed.data;
  });
