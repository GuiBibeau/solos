// @ts-check
/**
 * Pool-price dispatch. Meteora reads the LbPair. Orca and Raydium fail typed before any RPC,
 * the same refusal the use case raises, so a direct adapter call cannot return a half answer.
 */
import { poolReadUnsupported } from "@solos/core";
import { Effect } from "effect";
import { getMeteoraPoolLive } from "./meteora-dlmm-pool.js";

/** @typedef {import("../market/account-read.js").AccountRead} AccountRead */
/** @typedef {import("@solos/core").LiquidityGetPoolRequest} LiquidityGetPoolRequest */

/**
 * @param {AccountRead} read
 * @param {LiquidityGetPoolRequest} request
 * @returns {import("effect").Effect.Effect<import("@solos/core").PoolState, import("@solos/core").LiquidityError | import("@solos/core").RpcError>}
 */
export const getPoolLive = (read, request) =>
  request.protocol === "meteora"
    ? getMeteoraPoolLive(read, request)
    : Effect.fail(poolReadUnsupported(request.protocol));
