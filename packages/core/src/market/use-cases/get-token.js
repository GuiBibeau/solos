// @ts-check
import { Effect } from "effect";
import { TokenMetadataUnavailable, UnknownToken } from "../domain/errors.js";
import { GetTokenInputSchema, TokenMetadataSchema } from "../domain/types.js";
import { TokenRegistry } from "../ports/token-registry.js";

/**
 * Bounded echo of an input that failed validation: errors never carry unvalidated text
 * unbounded, and 44 base58 characters is the longest address a 32-byte value can encode.
 * @param {unknown} input
 */
const boundedMint = (input) => {
  const mint = /** @type {{ mint?: unknown } | undefined} */ (
    typeof input === "object" && input !== null ? input : undefined
  )?.mint;
  return typeof mint === "string" ? mint.slice(0, 44) : "";
};

/**
 * Read one token's verified on-chain metadata. Input is re-validated here so every entry
 * point — tool, CLI, harness — fails with a domain error before any RPC; input that is not an
 * address is not a mint, so it fails `UnknownToken`, the same tag the adapter uses for
 * nonexistent accounts. The result is re-checked against the public schema so a misbehaving
 * adapter can never leak decimals beyond the contract (this is where the 0–18 guarantee
 * holds even for a future adapter).
 * @param {import("../domain/types.js").GetTokenInput} input
 * @returns {import("effect").Effect.Effect<
 *   import("../domain/types.js").TokenMetadata,
 *   import("../domain/errors.js").TokenRegistryError,
 *   TokenRegistryShapeReq
 * >}
 * @typedef {import("../ports/token-registry.js").TokenRegistryShape} TokenRegistryShapeReq
 */
export const getToken = (input) =>
  Effect.gen(function* () {
    const parsed = GetTokenInputSchema.safeParse(input);
    if (!parsed.success) {
      return yield* new UnknownToken({ mint: boundedMint(input) });
    }
    const metadata = yield* (yield* TokenRegistry).getMetadata(parsed.data.mint);
    const checked = TokenMetadataSchema.safeParse(metadata);
    if (!checked.success) {
      return yield* new TokenMetadataUnavailable({
        mint: parsed.data.mint,
        reason: "metadata came back outside the public schema (name, symbol, decimals 0–18)",
      });
    }
    return checked.data;
  }).pipe(Effect.withSpan("market.getToken"));
