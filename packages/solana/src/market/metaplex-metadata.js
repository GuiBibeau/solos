// @ts-check
import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { readBoundedString } from "./metadata-strings.js";

/** Metaplex Token Metadata program, the legacy metadata home of classic SPL mints. */
export const METAPLEX_PROGRAM = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
/** `Key::MetadataV1` — byte 0 of a metadata account. */
export const METADATA_V1_KEY = 4;
/** Hard bound on a metadata account we are willing to decode. */
export const MAX_METADATA_ACCOUNT_BYTES = 4096;
/** V1 fixed prefix: key byte + update authority (32) + mint (32). */
const V1_STRING_START = 65;

const utf8 = getUtf8Encoder();
const addressBytes = getAddressEncoder();

/** @typedef {{ readonly status: "absent" } | { readonly status: "present"; readonly name: string; readonly symbol: string; readonly uri: string } | { readonly status: "invalid"; readonly reason: string }} MetaplexMetadata */

/**
 * Metadata PDA: seeds ["metadata", program id bytes, mint bytes] under the Metaplex program —
 * pure derivation, no RPC. Rejects only if the program id were on the curve, which it is not;
 * the adapter still treats rejection as unreadable metadata.
 * @param {string} mint
 * @returns {Promise<string>}
 */
export const metadataPda = (mint) =>
  getProgramDerivedAddress({
    programAddress: address(METAPLEX_PROGRAM),
    seeds: [
      utf8.encode("metadata"),
      new Uint8Array(addressBytes.encode(address(METAPLEX_PROGRAM))),
      new Uint8Array(addressBytes.encode(address(mint))),
    ],
  }).then(([pda]) => pda);

/**
 * Decode a Metaplex metadata account, V1 layout: key byte 4, 32-byte update authority
 * (ignored), 32-byte mint that must equal the requested mint, then name, symbol, and uri as
 * u32-prefixed strings with trailing NUL padding trimmed. Everything after `uri` (seller fees,
 * creators, collection) is never read. `null` bytes mean the PDA does not exist — the common
 * and legal case for tokens without Metaplex metadata.
 * @param {Uint8Array | null} bytes account data, or null when the account does not exist
 * @param {Uint8Array} mintBytes
 * @returns {MetaplexMetadata}
 */
export const decodeMetaplexMetadata = (bytes, mintBytes) => {
  if (bytes === null) return { status: "absent" };
  if (bytes.length > MAX_METADATA_ACCOUNT_BYTES) {
    return { status: "invalid", reason: "metadata account exceeds the decode bound" };
  }
  if (bytes.length < V1_STRING_START) {
    return { status: "invalid", reason: "metadata account is truncated" };
  }
  if (bytes[0] !== METADATA_V1_KEY) {
    return { status: "invalid", reason: "metadata account is not a MetadataV1" };
  }
  if (bytes.subarray(33, V1_STRING_START).some((byte, i) => byte !== mintBytes[i])) {
    return { status: "invalid", reason: "metadata does not belong to the requested mint" };
  }
  return readV1Strings(bytes);
};

/** The three u32-prefixed strings are the only V1 fields solOS reads. @param {Uint8Array} bytes @returns {MetaplexMetadata} */
const readV1Strings = (bytes) => {
  const name = readBoundedString(bytes, V1_STRING_START);
  if ("error" in name) return { status: "invalid", reason: name.error };
  const symbol = readBoundedString(bytes, name.end);
  if ("error" in symbol) return { status: "invalid", reason: symbol.error };
  const uri = readBoundedString(bytes, symbol.end);
  if ("error" in uri) return { status: "invalid", reason: uri.error };
  return { status: "present", name: name.text, symbol: symbol.text, uri: uri.text };
};
