// @ts-check
import { Context } from "effect";

/**
 * Phoenix Perps venue reads (ADR-0021). Account scope is fixed by the contract: traderPdaIndex
 * 0, traderSubaccountIndex 0. Reads are public — no credential exists for this port. Errors are
 * the `PerpError` union: unknown market, an unavailable provider, a corrupt account and
 * incomplete state stay distinct.
 * @typedef {{
 *   readonly getPosition: (request: import("../domain/types.js").GetPositionRequest) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").GetPositionResult,
 *       import("../domain/errors.js").PerpError
 *     >;
 *   readonly listPositions: (owner: import("../domain/types.js").GetPositionRequest["owner"]) =>
 *     import("effect").Effect.Effect<
 *       import("../domain/types.js").PerpEnumeration,
 *       import("../domain/errors.js").PerpError
 *     >;
 * }} PerpVenueShape
 */

export const PerpVenue = /** @type {Context.Tag<PerpVenueShape, PerpVenueShape>} */ (
  Context.GenericTag("@solos/perp/PerpVenue")
);
