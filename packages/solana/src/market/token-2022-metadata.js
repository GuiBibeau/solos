// @ts-check
import { getU16Decoder } from "@solana/kit";
import { invalid, decodeTokenMetadata } from "./token-2022-record.js";

export { MAX_ADDITIONAL_PAIRS } from "./token-2022-record.js";
export { MAX_LOGO_URI_BYTES, isHttpUrl, logoUriFromPairs } from "./logo-uri.js";

/** @typedef {import("./token-2022-record.js").TlvMetadata} TlvMetadata */

/** ExtensionType ordinals from the Token-2022 program's `interface/src/extension/mod.rs`. */
export const EXTENSION_METADATA_POINTER = 18;
export const EXTENSION_TOKEN_METADATA = 19;
/** Header of one TLV record: u16 LE type + u16 LE length. */
const RECORD_HEADER_BYTES = 4;

const u16 = getU16Decoder();

/** @param {Uint8Array} bytes @param {number} at */
const readU16 = (bytes, at) => u16.decode(bytes.subarray(at, at + 2));

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
 * One record at `offset`, after the permitted-end checks: zero bytes and a final single byte
 * (the last may be used during a realloc) end the walk, as does the two-byte type-0
 * Uninitialized marker before any length bytes are required. A nonzero type demands the full
 * four-byte header and an in-bounds value; both violations are malformed, as the program
 * rejects them. The `status` field marks a terminal walk outcome rather than a record.
 * @param {Uint8Array} extensions
 * @param {number} offset
 * @returns {{ readonly type: number; readonly value: Uint8Array } | TlvMetadata}
 */
const readRecord = (extensions, offset) => {
  const remaining = extensions.length - offset;
  if (remaining < 2) return { status: "absent" };
  const type = readU16(extensions, offset);
  if (type === 0) return { status: "absent" };
  if (remaining < RECORD_HEADER_BYTES) {
    return invalid("extension record header is truncated");
  }
  const length = readU16(extensions, offset + 2);
  if (offset + RECORD_HEADER_BYTES + length > extensions.length) {
    return invalid("extension record runs past the end of the account");
  }
  return {
    type,
    value: extensions.subarray(offset + RECORD_HEADER_BYTES, offset + RECORD_HEADER_BYTES + length),
  };
};

/**
 * Walk the Token-2022 extension records that follow the AccountType byte. Records are u16 LE
 * type + u16 LE length + value, back to back with no alignment padding. Permitted ends are
 * recognized before any header is demanded: zero bytes, a final single byte (the last byte
 * may be used during a realloc, `adjust_len_for_multisig` pads with two), and the two-byte
 * type-0 Uninitialized marker, which ends the walk before any length bytes are required. For
 * a nonzero type the full four-byte header plus an in-bounds value is then enforced — a
 * truncated initialized record or a value crossing the buffer end is malformed, as the
 * program rejects both. Unknown types are skipped by length, so future extensions cannot
 * break the read.
 * @param {Uint8Array} extensions bytes after the AccountType byte
 * @param {Uint8Array} mintBytes the mint the account must claim to describe
 * @returns {TlvMetadata}
 */
export const readTokenMetadataExtension = (extensions, mintBytes) => {
  let offset = 0;
  while (offset < extensions.length) {
    const record = readRecord(extensions, offset);
    if ("status" in record) return record;
    const verdict = readKnownRecord(record.type, record.value, mintBytes);
    if (verdict !== undefined) return verdict;
    offset += RECORD_HEADER_BYTES + record.value.length;
  }
  return { status: "absent" };
};
