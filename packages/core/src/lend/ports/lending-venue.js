// @ts-check
import { Context } from "effect";

/**
 * One Kamino reserve read against the one configured lending market. The market is
 * composition state, never a tool argument (ADR-0019: no hidden market selection, no
 * cross-market search); execute-tier use cases read it from here to build the `lend`
 * Action, and the executor revalidates it against its own configuration. Adapters
 * translate every failure into `LendingError` (the shared `RpcError` covers transport
 * failures).
 * @typedef {{
 *   readonly market: string;
 *   readonly getReserve: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").ReserveSnapshot, import("../domain/errors.js").LendingError>;
 *   readonly getPosition: (request: { readonly mint: import("../../shared/domain/address.js").Address; readonly owner: import("../../shared/domain/address.js").Address }) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").LendPosition, import("../domain/errors.js").LendingError>;
 *   readonly listPositions: (owner: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").LendEnumeration, import("../domain/errors.js").LendingError>;
 * }} LendingVenueShape
 */

export const LendingVenue = /** @type {Context.Tag<LendingVenueShape, LendingVenueShape>} */ (
  Context.GenericTag("@solos/lend/LendingVenue")
);
