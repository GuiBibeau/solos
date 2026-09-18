// @ts-check
import { getU16Decoder, getU32Decoder } from "@solana/kit";
import { readBoundedString } from "./metadata-strings.js";

/** ExtensionType ordinals from the Token-2022 program's `interface/src/extension/mod.rs`. */
export const EXTENSION_METADATA_POINTER = 18;
export const EXTENSION_TOKEN_METADATA = 19;
/** Header of one TLV record: u16 LE type + u16 LE length. */
const RECORD_HEADER_BYTES = 4;
/** Most pairs any sane token carries; bounds the pair loop before allocation. */
export const MAX_ADDITIONAL_PAIRS = 64;

const u16 = getU16Decoder();
const u32 = getU32Decoder();

/** @typedef {{ readonly status: "absent" } | { readonly status: "present"; readonly name: string; readonly symbol: string; readonly uri: string; readonly additionalMetadata: ReadonlyArray<readonly [string, string]> } | { readonly status: "invalid"; readonly reason: string }} TlvMetadata */

/** @param {string} reason @returns {TlvMetadata} */
const invalid = (reason) => ({ status: "invalid", reason });

/** @param {Uint8Array} bytes @param {number} at */
const readU16 = (bytes, at) => u16.decode(bytes.subarray(at, at + 2));

/** @param {Uint8Array} bytes @param {number} at */
const readU32 = (bytes, at) => u32.decode(bytes.subarray(at, at + 4));

/** @param {Uint8Array} bytes @param {Uint8Array} expected */
const matches = (bytes, expected) =>
  bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);

/**
 * MetadataPointer value: two 32-byte zeroable fields (authority, metadataAddress); all-zero
 * means None — deliberately not the 36-byte COption form of the base mint layout. A pointer
 * that targets an account other than this mint is not followed (bounded decoding); the caller
 * reports unavailable metadata instead.
 * @param {Uint8Array} value
 * @param {Uint8Array} mintBytes
 * @returns {string | undefined} reason when the pointer target is unsupported
 */
const pointerError = (value, mintBytes) => {
  if (value.length !== 64) return "metadata pointer value is not 64 bytes";
  const target = value.subarray(32, 64);
  if (target.every((byte) => byte === 0)) return undefined;
  if (!matches(target, mintBytes)) {
    return "metadata pointer targets a different account, which solOS does not follow";
  }
  return undefined;
};

/**
 * Decode one TokenMetadata record value: 32-byte zeroable update authority (ignored), 32-byte
 * mint that must equal the requested mint, then name, symbol, and uri as u32-prefixed
 * strings, then additional key/value pairs. The mint check runs before any string is decoded
 * so wrong-mint metadata never produces a ticker.
 * @param {Uint8Array} value
 * @param {Uint8Array} mintBytes
 * @returns {TlvMetadata}
 */
const decodeTokenMetadata = (value, mintBytes) => {
  if (value.length < 64) return invalid("token metadata value is truncated");
  if (!matches(value.subarray(32, 64), mintBytes)) {
    return invalid("metadata does not belong to the requested mint");
  }
  const name = readBoundedString(value, 64);
  if ("error" in name) return invalid(name.error);
  const symbol = readBoundedString(value, name.end);
  if ("error" in symbol) return invalid(symbol.error);
  const uri = readBoundedString(value, symbol.end);
  if ("error" in uri) return invalid(uri.error);
  const pairs = readAdditionalPairs(value, uri.end);
  if ("error" in pairs) return invalid(pairs.error);
  return {
    status: "present",
    name: name.text,
    symbol: symbol.text,
    uri: uri.text,
    additionalMetadata: pairs.list,
  };
};

/**
 * u32 LE pair count, then that many u32-prefixed key/value string pairs.
 * @param {Uint8Array} bytes
 * @param {number} start
 * @returns {{ readonly list: ReadonlyArray<readonly [string, string]> } | { readonly error: string }}
 */
const readAdditionalPairs = (bytes, start) => {
  if (bytes.length - start < 4) return { error: "additional pair count is truncated" };
  const count = readU32(bytes, start);
  if (count > MAX_ADDITIONAL_PAIRS) {
    return {
      error: `additional pair count ${count} exceeds the ${MAX_ADDITIONAL_PAIRS}-pair bound`,
    };
  }
  let cursor = start + 4;
  const list = /** @type {Array<readonly [string, string]>} */ ([]);
  for (let i = 0; i < count; i++) {
    const key = readBoundedString(bytes, cursor);
    if ("error" in key) return key;
    const value = readBoundedString(bytes, key.end);
    if ("error" in value) return value;
    list.push([key.text, value.text]);
    cursor = value.end;
  }
  return { list };
};

/**
 * The one extension type solOS interprets per record besides skipping: the metadata pointer
 * must not point away, and TokenMetadata is the payload. Unknown types never reach here.
 * @param {number} type
 * @param {Uint8Array} value
 * @param {Uint8Array} mintBytes
 * @returns {TlvMetadata | undefined} a terminal verdict, or undefined to keep walking
 */
const readKnownRecord = (type, value, mintBytes) => {
  if (type === EXTENSION_METADATA_POINTER) {
    const pointer = pointerError(value, mintBytes);
    return pointer === undefined ? undefined : invalid(pointer);
  }
  if (type === EXTENSION_TOKEN_METADATA) return decodeTokenMetadata(value, mintBytes);
  return undefined;
};

/**
 * Walk the Token-2022 extension records that follow the AccountType byte. Records are u16 LE
 * type + u16 LE length + value, back to back with no alignment padding. The walk stops at
 * type 0 (the program's Uninitialized marker, also its trailing allocated space); a remaining
 * fragment shorter than a header, or a value crossing the buffer end, is malformed — the
 * program rejects both as invalid account data. Unknown types are skipped by length, so
 * future extensions cannot break the read.
 * @param {Uint8Array} extensions bytes after the AccountType byte
 * @param {Uint8Array} mintBytes the mint the account must claim to describe
 * @returns {TlvMetadata}
 */
export const readTokenMetadataExtension = (extensions, mintBytes) => {
  let offset = 0;
  while (offset < extensions.length) {
    if (extensions.length - offset < RECORD_HEADER_BYTES) {
      return invalid("extension record header is truncated");
    }
    const type = readU16(extensions, offset);
    if (type === 0) break;
    const length = readU16(extensions, offset + 2);
    if (offset + RECORD_HEADER_BYTES + length > extensions.length) {
      return invalid("extension record runs past the end of the account");
    }
    const value = extensions.subarray(
      offset + RECORD_HEADER_BYTES,
      offset + RECORD_HEADER_BYTES + length,
    );
    const verdict = readKnownRecord(type, value, mintBytes);
    if (verdict !== undefined) return verdict;
    offset += RECORD_HEADER_BYTES + length;
  }
  return { status: "absent" };
};

/** Longest logo URI we will surface; anything longer is treated as malformed. */
export const MAX_LOGO_URI_BYTES = 1024;

// C0 control range (below 32) plus DEL (127): the URL parser silently strips newline, tab and
// carriage return, and control characters never belong in a URI we surface.
const CONTROL_CHARS_MAX = 31;
const DEL_CHAR = 127;

/** @param {string} value @returns {boolean} true when the candidate carries a control character */
const hasControlChars = (value) => {
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i) ?? DEL_CHAR;
    if (code === DEL_CHAR || code <= CONTROL_CHARS_MAX) return true;
  }
  return false;
};

/**
 * A value is a usable logo URI only when it is bounded, free of control characters, and parses
 * as an absolute URL whose protocol is http or https with a non-empty host. A value that
 * merely starts with `https://` but does not parse (such as `https://` alone) is rejected
 * here, so malformed logo metadata leaves `logoUri` null instead of poisoning an otherwise
 * readable record.
 * @param {string} value
 * @returns {boolean}
 */
export const isHttpUrl = (value) => {
  if (value.length > MAX_LOGO_URI_BYTES || hasControlChars(value)) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
};

/**
 * logoUri comes only from an additional-metadata pair keyed exactly `logo` whose value parses
 * as an http(s) URL; null otherwise. The metadata `uri` field is never treated as a logo.
 * @param {ReadonlyArray<readonly [string, string]>} pairs
 * @returns {string | null}
 */
export const logoUriFromPairs = (pairs) => {
  for (const [key, value] of pairs) {
    if (key === "logo" && isHttpUrl(value)) return value;
  }
  return null;
};
