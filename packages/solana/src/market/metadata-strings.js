// @ts-check
import { getU32Decoder, getUtf8Decoder } from "@solana/kit";

/** Longest string any metadata field may decode: bounds work before allocation. */
export const MAX_STRING_BYTES = 1024;

const u32 = getU32Decoder();
const utf8 = getUtf8Decoder();

/**
 * Legacy minters NUL-pad name/symbol/uri to old maximums; trailing padding is not content.
 * (Character-code loop: a NUL-control regex trips the no-control-regex lint rule.)
 * @param {string} text
 */
export const trimTrailingNuls = (text) => {
  let end = text.length;
  while (end > 0 && text.codePointAt(end - 1) === 0) end--;
  return end === text.length ? text : text.slice(0, end);
};

/**
 * Decode one borsh string — u32 LE byte length + UTF-8 — at `start`. The length is checked
 * against the bound and the remaining bytes before anything is allocated, so malformed or
 * oversized metadata fails promptly. Invalid UTF-8 is rejected (Kit's decoder replaces bad
 * sequences with U+FFFD and strips NUL bytes; a U+FFFD in the output means the bytes were
 * never valid text, and NUL padding from legacy minters is trimmed either way).
 * @param {Uint8Array} bytes
 * @param {number} start
 * @returns {{ readonly text: string; readonly end: number } | { readonly error: string }}
 */
export const readBoundedString = (bytes, start) => {
  if (bytes.length - start < 4) return { error: "string length prefix is truncated" };
  const length = u32.decode(bytes.subarray(start, start + 4));
  if (length > MAX_STRING_BYTES) {
    return { error: `string of ${length} bytes exceeds the ${MAX_STRING_BYTES}-byte decode bound` };
  }
  const textStart = start + 4;
  if (bytes.length - textStart < length) return { error: "string value is truncated" };
  const text = trimTrailingNuls(utf8.decode(bytes.subarray(textStart, textStart + length)));
  if (text.includes("\u{FFFD}")) return { error: "string is not valid UTF-8" };
  return { text, end: textStart + length };
};
