// @ts-check
import { Context } from "effect";

/**
 * @typedef {{
 *   readonly getMetadata: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").TokenMetadata, import("../domain/errors.js").UnknownToken>;
 * }} TokenRegistryShape
 */

export const TokenRegistry = /** @type {Context.Tag<TokenRegistryShape, TokenRegistryShape>} */ (
  Context.GenericTag("@solos/market/TokenRegistry")
);
