// @ts-check
import { Effect } from "effect";
import { LiquidityInputInvalid, poolReadUnsupported } from "../domain/errors.js";
import { LiquidityGetPoolInputSchema } from "../domain/pool-state.js";
import { isPoolReadable } from "../domain/types.js";
import { LiquidityVenue } from "../ports/liquidity-venue.js";

/** @typedef {import("../domain/errors.js").LiquidityError | import("../../shared/index.js").RpcError} GetPoolError */
/** @typedef {import("../ports/liquidity-venue.js").LiquidityVenueShape} GetPoolContext */

/**
 * Read where one Meteora DLMM pool is trading. Input is re-validated so every entry point
 * fails before any provider access. Orca and Raydium fail typed before the venue is touched.
 * The read needs no signer: a pool is public.
 * @param {import("../domain/pool-state.js").LiquidityGetPoolInput} input
 * @returns {import("effect").Effect.Effect<import("../domain/pool-state.js").PoolState, GetPoolError, GetPoolContext>}
 */
export const getPool = (input) =>
  Effect.gen(function* () {
    const parsed = LiquidityGetPoolInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new LiquidityInputInvalid({
        reason: "protocol must be orca, meteora or raydium and pool a base58 address",
      });
    }
    if (!isPoolReadable(parsed.data.protocol)) {
      return yield* poolReadUnsupported(parsed.data.protocol);
    }
    return yield* (yield* LiquidityVenue).getPool({
      protocol: parsed.data.protocol,
      pool: parsed.data.pool,
    });
  }).pipe(Effect.withSpan("liquidity.getPool"));
