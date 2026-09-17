// @ts-check

/** Bitcoin base58 alphabet — the one Solana addresses use. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Number of bytes a base58 string decodes to, or undefined when it contains a non-base58
 * character. Leading `1`s decode to leading zero bytes, so a string of 32 `1`s is exactly 32
 * bytes, not zero. Pure computation, used to reject strings that only look like addresses by
 * staying inside the 32–44 character range — 44 `z`s, for instance, decode to 33 bytes.
 * @param {string} value
 * @returns {number | undefined}
 */
export const base58ByteLength = (value) => {
  /** @type {number[]} */
  const bytes = [];
  for (const char of value) {
    let carry = ALPHABET.indexOf(char);
    if (carry < 0) return undefined;
    for (let i = 0; i < bytes.length; i++) {
      carry += (bytes[i] ?? 0) * 58;
      bytes[i] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.push(0);
  }
  return bytes.length;
};
