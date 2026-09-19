// @ts-check
import { Context } from "effect";

/**
 * Current state of one Pump bonding curve, read over the configured RPC. One read-only
 * method: no trading, no migration tracking, no pool-existence claim. `complete` is the
 * on-chain flag and never proves a PumpSwap pool exists. Adapters translate every failure
 * into `LaunchCurveError` (the shared `RpcError` covers transport failures).
 * @typedef {{
 *   readonly getCurve: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").LaunchCurve, import("../domain/errors.js").LaunchCurveError>;
 * }} LaunchVenueShape
 */

export const LaunchVenue = /** @type {Context.Tag<LaunchVenueShape, LaunchVenueShape>} */ (
  Context.GenericTag("@solos/launch/LaunchVenue")
);
