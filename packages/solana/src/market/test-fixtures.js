// @ts-check
/**
 * Byte-level fixtures for mint metadata decoding, shared by the decode unit tests. These
 * encode exactly the layouts verified against the programs' own sources:
 * classic mint = 82 bytes; Token-2022 mint = 82 + AccountType byte + TLV records
 * (u16 LE type + u16 LE length + value); Metaplex V1 = key byte + 32 + 32 + u32 strings.
 */
import { getBase16Decoder, getUtf8Encoder, none } from "@solana/kit";
import { getMintEncoder } from "@solana-program/token";

const utf8 = getUtf8Encoder();

/** @param {number} value @returns {Uint8Array} u16 little-endian */
export const u16le = (value) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
};

/** @param {number} value @returns {Uint8Array} u32 little-endian */
export const u32le = (value) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
};

/** @param {string} text @returns {Uint8Array} borsh string: u32 LE length + UTF-8 */
export const prefixedString = (text) => {
  const body = utf8.encode(text);
  const out = new Uint8Array(4 + body.length);
  out.set(u32le(body.length), 0);
  out.set(body, 4);
  return out;
};

/** @param {...Uint8Array} parts @returns {Uint8Array} */
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** @param {number} type @param {Uint8Array} value @returns {Uint8Array} one TLV record */
export const tlvRecord = (type, value) => concat(u16le(type), u16le(value.length), value);

/** @param {{ decimals: number; isInitialized?: boolean }} options @returns {Uint8Array} 82-byte classic mint */
export const classicMintBytes = ({ decimals, isInitialized = true }) =>
  new Uint8Array(
    getMintEncoder().encode({
      mintAuthority: none(),
      supply: 0n,
      decimals,
      isInitialized,
      freezeAuthority: none(),
    }),
  );

/**
 * @param {{
 *   decimals: number;
 *   records: Uint8Array[];
 *   accountType?: number;
 * }} options
 * @returns {Uint8Array} Token-2022 mint: base 82 + AccountType + TLV records
 */
export const token2022MintBytes = ({ decimals, records, accountType = 1 }) =>
  concat(classicMintBytes({ decimals }), new Uint8Array([accountType]), ...records);

/** @param {number} length @returns {Uint8Array} all-zero bytes */
export const zeros = (length) => new Uint8Array(length);

/**
 * @param {{
 *   mintBytes: Uint8Array;
 *   name: string;
 *   symbol: string;
 *   uri: string;
 *   updateAuthority?: Uint8Array;
 *   pairs?: ReadonlyArray<readonly [string, string]>;
 * }} options
 * @returns {Uint8Array} TokenMetadata borsh value for TLV record type 19
 */
export const tokenMetadataValue = ({
  mintBytes,
  name,
  symbol,
  uri,
  updateAuthority,
  pairs = [],
}) => {
  const parts = [
    updateAuthority ?? zeros(32),
    mintBytes,
    prefixedString(name),
    prefixedString(symbol),
    prefixedString(uri),
    u32le(pairs.length),
  ];
  for (const [key, value] of pairs) parts.push(prefixedString(key), prefixedString(value));
  return concat(...parts);
};

/**
 * @param {{
 *   mintBytes: Uint8Array;
 *   name: string;
 *   symbol: string;
 *   uri: string;
 *   key?: number;
 *   padTo?: number;
 * }} options
 * @returns {Uint8Array} Metaplex MetadataV1 account bytes (only the fields solOS reads)
 */
export const metaplexV1Bytes = ({ mintBytes, name, symbol, uri, key = 4, padTo = 0 }) => {
  const head = concat(new Uint8Array([key]), zeros(32), mintBytes);
  const tail = concat(prefixedString(name), prefixedString(symbol), prefixedString(uri));
  return padTo > head.length + tail.length
    ? concat(head, tail, zeros(padTo - head.length - tail.length))
    : concat(head, tail);
};

/** @param {Uint8Array} bytes @returns {string} base16, for `surfnet_setAccount` fixtures */
export const base16 = (bytes) => getBase16Decoder().decode(bytes);
