// @ts-check
/** @typedef {import("@solos/core/market").TokenRegistryError} TokenRegistryError */
/** @typedef {import("@solos/core/market").TokenMetadata} TokenMetadata */
/** @typedef {import("./mint-account.js").RawAccount} RawAccount */
/** @typedef {import("./account-read.js").AccountRead} AccountRead */
/** Metadata a verified read produced. @typedef {{ readonly name: string; readonly symbol: string; readonly logoUri: string | null }} VerifiedMetadata */
/** @typedef {{ readonly status: "absent" } | { readonly status: "invalid"; readonly reason: string } | ({ readonly status: "present" } & VerifiedMetadata)} ReadMetadata */
import { address, getAddressEncoder } from "@solana/kit";
import { TokenMetadataUnavailable, TokenRegistry, UnknownToken } from "@solos/core";
import { Effect, Layer } from "effect";
import { rpcOrigin } from "../rpc/rpc-origin.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { fetchAccount, TOKEN_RPC_TIMEOUT_MS } from "./account-read.js";
import { canonicalMint } from "./canonical-mints.js";
import { decodeMetaplexMetadata, metadataPda } from "./metaplex-metadata.js";
import { MAX_MINT_ACCOUNT_BYTES, base64AccountData, readMintLayout } from "./mint-account.js";
import { logoUriFromPairs, readTokenMetadataExtension } from "./token-2022-metadata.js";

/** The public schema caps decimals at 18; see `TokenMetadataSchema` in @solos/core. */
const MAX_SCHEMA_DECIMALS = 18;

const addressBytes = getAddressEncoder();

/**
 * Metaplex metadata for one mint: derive the PDA (rejection is treated as unreadable), then
 * one bounded account read. `logoUri` is null by construction — Metaplex has no logo field,
 * and the decoded `uri` is discarded, never fetched, never presented as a logo.
 * @param {AccountRead} read
 * @param {string} mint
 * @param {Uint8Array} mintBytes
 * @returns {Effect.Effect<ReadMetadata, TokenRegistryError>}
 */
const metaplexMetadata = (read, mint, mintBytes) =>
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
const token2022Metadata = (read, layout, forMint) =>
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

/**
 * The account failed the mint guards: `UnknownToken` for a non-mint, a metadata-unavailable
 * failure for an account too large to decode safely.
 * @param {string} mint
 * @param {{ readonly verdict: "not-a-mint"; readonly reason: string } | { readonly verdict: "account-too-large"; readonly bytes: number }} layout
 * @returns {TokenRegistryError}
 */
const unverifiedMintError = (mint, layout) =>
  layout.verdict === "not-a-mint"
    ? new UnknownToken({ mint })
    : new TokenMetadataUnavailable({
        mint,
        reason: `mint account of ${layout.bytes} bytes exceeds the ${MAX_MINT_ACCOUNT_BYTES}-byte decode bound`,
      });

/**
 * @param {string} mint
 * @param {number} decimals
 * @param {VerifiedMetadata} metadata
 */
const toTokenMetadata = (mint, decimals, { name, symbol, logoUri }) => ({
  mint,
  name,
  symbol,
  decimals,
  logoUri,
});

/**
 * Metadata is absent (not unreadable): the canonical wSOL/USDC mapping may apply, gated on the
 * verified layout; anything else is a distinct metadata-unavailable failure, never a ticker.
 * @param {string} mint
 * @param {{ readonly verdict: "mint"; readonly program: "spl" | "token-2022"; readonly decimals: number }} layout
 * @returns {Effect.Effect<TokenMetadata, TokenRegistryError>}
 */
const absentMetadata = (mint, layout) => {
  const canonical = canonicalMint(mint, layout);
  if (canonical !== null) {
    return Effect.succeed(toTokenMetadata(mint, layout.decimals, { ...canonical, logoUri: null }));
  }
  return Effect.fail(
    new TokenMetadataUnavailable({
      mint,
      reason: "mint carries no metadata account and has no canonical mapping",
    }),
  );
};

/** Wrap one `getAccountInfo` value into the raw-account shape the guards decode. @param {{ owner: string; data: readonly [string, string] } | null} info */
const rawAccountOf = (info) =>
  info === null
    ? null
    : /** @type {RawAccount} */ ({ owner: info.owner, data: base64AccountData(info.data) });

/**
 * Read and verify one mint. Guards run before any decode; metadata is read from the mint's
 * own extension or its Metaplex PDA and must claim this mint; the canonical wSOL/USDC mapping
 * applies only when metadata is absent (never when unreadable) and only after the on-chain
 * decimals match the documented ones.
 * @param {AccountRead} read
 * @param {string} mint
 * @returns {Effect.Effect<TokenMetadata, TokenRegistryError>}
 */
const getMetadata = (read, mint) =>
  Effect.gen(function* () {
    const layout = readMintLayout(rawAccountOf(yield* fetchAccount(read, mint)));
    if (layout.verdict !== "mint") return yield* unverifiedMintError(mint, layout);
    if (layout.decimals > MAX_SCHEMA_DECIMALS) {
      return yield* new TokenMetadataUnavailable({
        mint,
        reason: `mint declares ${layout.decimals} decimals, outside the public schema's 0-18`,
      });
    }
    const mintBytes = new Uint8Array(addressBytes.encode(address(mint)));
    const metadata =
      layout.program === "token-2022"
        ? yield* token2022Metadata(read, layout, { mint, mintBytes })
        : yield* metaplexMetadata(read, mint, mintBytes);
    if (metadata.status === "invalid") {
      return yield* new TokenMetadataUnavailable({ mint, reason: metadata.reason });
    }
    if (metadata.status === "present") return toTokenMetadata(mint, layout.decimals, metadata);
    return yield* absentMetadata(mint, layout);
  });

/**
 * Live `TokenRegistry` over the shared `SolanaRpc` service: one configured endpoint, the same
 * one every other Solana tool uses. No config parameter, no env access, no fallback endpoint.
 * @param {{ readonly timeoutMs?: number }} [config] injectable read deadline, for tests
 */
export const TokenRegistryLive = (config) =>
  Layer.effect(
    TokenRegistry,
    Effect.map(SolanaRpc, (ctx) => {
      /** @type {AccountRead} */
      const read = {
        rpc: ctx.rpc,
        origin: rpcOrigin(ctx.url),
        timeoutMs: config?.timeoutMs ?? TOKEN_RPC_TIMEOUT_MS,
      };
      return { getMetadata: (mint) => getMetadata(read, mint) };
    }),
  );
