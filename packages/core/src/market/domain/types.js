// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

export const TokenPriceSchema = z.object({
  mint: AddressSchema,
  priceUsd: z.string().describe("Decimal USD price"),
  source: z.string().describe("Feed that produced the price"),
  at: z.number().int().describe("Unix epoch milliseconds"),
});

/** @typedef {z.infer<typeof TokenPriceSchema>} TokenPrice */

export const TokenMetadataSchema = z.object({
  mint: AddressSchema,
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(18),
  logoUri: z.string().url().nullable(),
});

/** @typedef {z.infer<typeof TokenMetadataSchema>} TokenMetadata */
