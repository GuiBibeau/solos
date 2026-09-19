// @ts-check
import { getU32Decoder } from "@solana/kit";
import { readBoundedString } from "./metadata-strings.js";

/** Most pairs any sane token carries; bounds the pair loop before allocation. */
export const MAX_ADDITIONAL_PAIRS = 64;

const u32 = getU32Decoder();

/**
 * One TokenMetadata record's decoded verdict: present with its strings and additional pairs,
 * or invalid with the reason the bytes cannot be trusted.
 * @typedef {{ readonly status: "absent" } | { readonly status: "present"; readonly name: string; readonly symbol: string; readonly uri: string; readonly additionalMetadata: ReadonlyArray<readonly [string, string]> } | { readonly status: "invalid"; readonly reason: string }} TlvMetadata
 */

/** @param {string} reason @returns {TlvMetadata} */
export const invalid = (reason) => ({ status: "invalid", reason });

/**
 * Decode one TokenMetadata record value: 32-byte zeroable update authority (ignored), 32-byte
 * mint that must equal the requested mint, then name, symbol, and uri as u32-prefixed
 * strings, then additional key/value pairs. The mint check runs before any string is decoded
 * so wrong-mint metadata never produces a ticker.
 * @param {Uint8Array} value
 * @param {Uint8Array} mintBytes
 * @returns {TlvMetadata}
 */
export const decodeTokenMetadata = (value, mintBytes) => {
  if (value.length < 64) return invalid("token metadata value is truncated");
  if (!matchesMint(value.subarray(32, 64), mintBytes)) {
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

/** @param {Uint8Array} bytes @param {Uint8Array} expected */
const matchesMint = (bytes, expected) =>
  bytes.length === expected.length && bytes.every((byte, i) => byte === expected[i]);

/**
 * u32 LE pair count, then that many u32-prefixed key/value string pairs.
 * @param {Uint8Array} bytes
 * @param {number} start
 * @returns {{ readonly list: ReadonlyArray<readonly [string, string]> } | { readonly error: string }}
 */
const readAdditionalPairs = (bytes, start) => {
  if (bytes.length - start < 4) return { error: "additional pair count is truncated" };
  const count = u32.decode(bytes.subarray(start, start + 4));
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
