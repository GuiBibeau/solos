// @ts-check
import { z } from "zod";
import { AddressSchema, SignatureSchema } from "../../shared/domain/address.js";

export const SwapQuoteRequestSchema = z.object({
  inputMint: AddressSchema.describe("Mint of the token to sell"),
  outputMint: AddressSchema.describe("Mint of the token to buy"),
  amount: z.string().regex(/^\d+$/).describe("Input amount in base units of inputMint"),
  slippageBps: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(50)
    .describe("Max slippage in basis points. Default 50 (0.5%)."),
});

/** @typedef {z.infer<typeof SwapQuoteRequestSchema>} SwapQuoteRequest */

export const SwapQuoteSchema = z.object({
  provider: z.string().describe("Aggregator or DEX that produced the quote"),
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  inAmount: z.string(),
  outAmount: z.string(),
  minOutAmount: z.string().describe("Worst case after slippage"),
  priceImpactPct: z.string(),
  routeSummary: z.array(z.string()).describe("Human-readable hops"),
  expiresAt: z.number().int().describe("Unix epoch milliseconds"),
  /** Opaque provider payload needed to execute this exact quote. */
  raw: z.unknown(),
});

/** @typedef {z.infer<typeof SwapQuoteSchema>} SwapQuote */

export const SwapReceiptSchema = z.object({
  signature: SignatureSchema,
  quote: SwapQuoteSchema,
});

/** @typedef {z.infer<typeof SwapReceiptSchema>} SwapReceipt */
