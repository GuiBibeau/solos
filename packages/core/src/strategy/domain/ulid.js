// @ts-check

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** @param {number} time */
const encodeTime = (time) => {
  let value = time;
  const chars = Array.from({ length: 10 }, () => "0");
  for (let index = 9; index >= 0; index -= 1) {
    chars[index] = ALPHABET[value % 32] ?? "0";
    value = Math.floor(value / 32);
  }
  return chars.join("");
};

/** @param {Uint8Array} bytes */
const encodeRandom = (bytes) => {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31] ?? "0";
    }
  }
  return out;
};

/**
 * A ULID from a millisecond timestamp and 10 random bytes (80 bits).
 * @param {number} time
 * @param {Uint8Array} random
 */
export const ulidFrom = (time, random) => {
  if (random.length !== 10) throw new Error("ULID randomness is 10 bytes");
  return encodeTime(time) + encodeRandom(random);
};
