// @ts-check
import { z } from "zod";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]+$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Decoded byte length of a base58 string in Bitcoin convention: each leading `1` is a leading
 * zero byte, the rest is a big-endian integer. Returns -1 for characters outside the alphabet.
 * @param {string} value
 */
/** @param {string} value */
const base58ByteLength = (value) => {
  /** @type {number[]} */
  const digits = [];
  for (const char of value) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) return -1;
    for (let i = 0; i < digits.length; i++) {
      carry += (digits[i] ?? 0) * 58;
      digits[i] = carry % 256;
      carry = Math.trunc(carry / 256);
    }
    while (carry > 0) {
      digits.push(carry % 256);
      carry = Math.trunc(carry / 256);
    }
  }
  let zeros = 0;
  for (const char of value) {
    if (char !== "1") break;
    zeros += 1;
  }
  return zeros + digits.length;
};

/** @param {string} value */
const is32ByteBase58 = (value) => base58ByteLength(value) === 32;

/** Base58 Solana address: exactly 32 bytes once decoded. Every canonical encoding of a 32-byte value is 32-44 chars, so the cheap encoded-length bound runs before the decode - curve checking stays with adapters. */
export const AddressSchema = z
  .string()
  .regex(BASE58_ADDRESS, "expected a base58 Solana address")
  .refine(
    (value) => value.length >= 32 && value.length <= 44 && is32ByteBase58(value),
    "address does not decode to exactly 32 bytes",
  )
  .describe("Base58 Solana account address");

/** @typedef {z.infer<typeof AddressSchema>} Address */

/** Base58 transaction signature. */
export const SignatureSchema = z
  .string()
  .regex(BASE58_SIGNATURE, "expected a base58 signature")
  .describe("Base58 transaction signature");

/** @typedef {z.infer<typeof SignatureSchema>} Signature */

/** Non-negative integer amount in base units, as a decimal string (JSON has no bigint). */
export const AmountSchema = z
  .string()
  .regex(/^\d+$/, "expected a non-negative integer as a decimal string")
  .describe("Integer amount in base units, decimal string");

/** @typedef {z.infer<typeof AmountSchema>} Amount */

/** Decimal number as a string, e.g. "123.45". */
export const DecimalSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "expected a decimal number as a string")
  .describe("Decimal number as a string");

/** Unix epoch milliseconds. */
export const TimestampSchema = z.number().int().nonnegative().describe("Unix epoch milliseconds");
