// @ts-check
/** @typedef {import("@solos/core/market").TokenRegistryError} TokenRegistryError */
/** @typedef {import("./account-read.js").AccountRead} AccountRead */
/** Metadata a verified read produced. @typedef {{ readonly name: string; readonly symbol: string; readonly logoUri: string | null }} VerifiedMetadata */
/** @typedef {{ readonly status: "absent" } | { readonly status: "invalid"; readonly reason: string } | ({ readonly status: "present" } & VerifiedMetadata)} ReadMetadata */
import { Effect } from "effect";
import { fetchAccount } from "./account-read.js";
import { decodeMetaplexMetadata, metadataPda } from "./metaplex-metadata.js";
import { base64AccountData } from "./mint-account.js";
import { logoUriFromPairs, readTokenMetadataExtension } from "./token-2022-metadata.js";

/**
 * Metaplex metadata for one mint: derive the PDA (rejection is treated as unreadable), then
 * one bounded account read. `logoUri` is null by construction — Metaplex has no logo field,
 * and the decoded `uri` is discarded, never fetched, never presented as a logo.
 * @param {AccountRead} read
 * @param {string} mint
 * @param {Uint8Array} mintBytes
 * @returns {Effect.Effect<ReadMetadata, TokenRegistryError>}
 */
export const metaplexMetadata = (read, mint, mintBytes) =>
  Effect.gen(function* () {
    const derived = yield* Effect.either(
      Effect.tryPromise({
        try: () => metadataPda(mint),
        catch: () => new Error("pda derivation failed"),
      }),
    );
    if (derived._tag === "Left") {
      return {
        status: /** @type {const} */ ("invalid"),
        reason: "metadata address could not be derived",
      };
    }
    const info = yield* fetchAccount(read, derived.right);
    const bytes =
      info === null
        ? null
        : base64AccountData(/** @type {readonly [string, string]} */ (info.data));
    const decoded = decodeMetaplexMetadata(bytes, mintBytes);
    if (decoded.status === "present") {
      return { status: "present", name: decoded.name, symbol: decoded.symbol, logoUri: null };
    }
    return decoded;
  });

/**
 * Token-2022 metadata: the in-mint extension when present, else the Metaplex PDA (some
 * Token-2022 mints carry classic Metaplex metadata instead).
 * @param {AccountRead} read
 * @param {{ readonly extensions: Uint8Array | undefined }} layout
 * @param {{ readonly mint: string; readonly mintBytes: Uint8Array }} forMint
 * @returns {Effect.Effect<ReadMetadata, TokenRegistryError>}
 */
export const token2022Metadata = (read, layout, forMint) =>
  Effect.gen(function* () {
    if (layout.extensions !== undefined) {
      const walked = readTokenMetadataExtension(layout.extensions, forMint.mintBytes);
      if (walked.status === "present") {
        return {
          status: "present",
          name: walked.name,
          symbol: walked.symbol,
          logoUri: logoUriFromPairs(walked.additionalMetadata),
        };
      }
      if (walked.status === "invalid") return walked;
    }
    return yield* metaplexMetadata(read, forMint.mint, forMint.mintBytes);
  });
