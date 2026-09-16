// @ts-check
import { z } from "zod";

const BASE58_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

/** Base58 Solana address. Length-checked here, curve-checked by adapters. */
export const AddressSchema = z
  .string()
  .regex(BASE58_ADDRESS, "expected a base58 Solana address")
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
