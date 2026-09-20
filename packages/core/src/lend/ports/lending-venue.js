// @ts-check
import { Context } from "effect";

/**
 * One Kamino reserve read against the one configured lending market. The market is
 * composition state, never a tool argument (ADR-0019: no hidden market selection, no
 * cross-market search). One read-only method: no deposit, no withdraw, no rate routing.
 * Adapters translate every failure into `LendingError` (the shared `RpcError` covers
 * transport failures).
 * @typedef {{
 *   readonly getReserve: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").ReserveSnapshot, import("../domain/errors.js").LendingError>;
 * }} LendingVenueShape
 */

export const LendingVenue = /** @type {Context.Tag<LendingVenueShape, LendingVenueShape>} */ (
  Context.GenericTag("@solos/lend/LendingVenue")
);
