// @ts-check
import { Context } from "effect";

/**
 * Verified on-chain metadata for one mint, read over the configured RPC. Adapters translate
 * every failure into `TokenRegistryError`: `UnknownToken` when the address is not a mint,
 * `TokenMetadataUnavailable` when the mint exists but its metadata is absent or unreadable,
 * and the shared `RpcError` for transport failures.
 * @typedef {{
 *   readonly getMetadata: (mint: import("../../shared/domain/address.js").Address) =>
 *     import("effect").Effect.Effect<import("../domain/types.js").TokenMetadata, import("../domain/errors.js").TokenRegistryError>;
 * }} TokenRegistryShape
 */

export const TokenRegistry = /** @type {Context.Tag<TokenRegistryShape, TokenRegistryShape>} */ (
  Context.GenericTag("@solos/market/TokenRegistry")
);
