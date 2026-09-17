// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { base58ByteLength } from "../../shared/domain/base58.js";

/**
 * `at` is when the price arrived locally, never a source-data timestamp: feed responses carry
 * provider sequence numbers or cached data, so receipt time must not be read as freshness.
 */
export const TokenPriceSchema = z.object({
  mint: AddressSchema,
  priceUsd: z.string().describe("Decimal USD price"),
  source: z.string().describe("Feed that produced the price"),
  at: z.number().int().describe("Unix epoch milliseconds when the price was received locally"),
});

/** @typedef {z.infer<typeof TokenPriceSchema>} TokenPrice */

/**
 * One price read: the mint to price in USD. Beyond the base58 shape, the address must decode to
 * the 32 bytes of a Solana public key — the character range alone admits strings that decode to
 * more, which would otherwise reach the provider instead of failing pre-HTTP.
 */
export const GetPriceInputSchema = z.object({
  mint: AddressSchema.refine(
    (value) => base58ByteLength(value) === 32,
    "mint must decode to a 32-byte Solana address",
  ).describe("Token mint address to price in USD"),
});

/** @typedef {z.infer<typeof GetPriceInputSchema>} GetPriceInput */

export const TokenMetadataSchema = z.object({
  mint: AddressSchema,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(18),
  logoUri: z.string().url().nullable(),
});

/** @typedef {z.infer<typeof TokenMetadataSchema>} TokenMetadata */

/** One Iris question: trimmed nonempty, at most 4000 characters. */
export const AskIrisInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .describe("One market question, e.g. what changed for SOL in the last 24 hours"),
});

/** @typedef {z.infer<typeof AskIrisInputSchema>} AskIrisInput */

/**
 * Iris' written answer. `receivedAt` is local Unix epoch milliseconds at receipt, not a
 * source-data timestamp; links appear only inside the provider-supplied answer text.
 */
export const MarketAnswerSchema = z.object({
  provider: z.literal("elfa"),
  answer: z.string().min(1),
  creditsConsumed: z.number().min(0).describe("Elfa credits this single call consumed"),
  receivedAt: z.number().int().describe("Unix epoch milliseconds when the answer arrived"),
});

/** @typedef {z.infer<typeof MarketAnswerSchema>} MarketAnswer */
