// @ts-check
import { Context } from "effect";

/**
 * Liquidity venue reads (ADR-0022). `position` is always the protocol position account;
 * ownership is proven by custody of the position NFT, never fabricated. Reads are public —
 * no credential exists for this port. Errors are the `LiquidityError` union plus the shared
 * `RpcError`: input and protocol rejections happen before the network, an absent or corrupt
 * position is a typed unavailable error, and an over-bound enumeration fails completely.
 * @typedef {{
 *   readonly getPosition: (request: import("../domain/types.js").LiquidityGetPositionRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").LpPosition,
 *       import("../domain/errors.js").LiquidityError | import("../../shared/index.js").RpcError
 *     >;
 *   readonly listPositions: (request: import("../domain/types.js").LiquidityListPositionsRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").LiquidityEnumeration,
 *       import("../domain/errors.js").LiquidityError | import("../../shared/index.js").RpcError
 *     >;
 * }} LiquidityVenueShape
 */

export const LiquidityVenue = /** @type {Context.Tag<LiquidityVenueShape, LiquidityVenueShape>} */ (
  Context.GenericTag("@solos/liquidity/LiquidityVenue")
);
