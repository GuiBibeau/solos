// @ts-check

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
