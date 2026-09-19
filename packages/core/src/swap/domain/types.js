// @ts-check
import { z } from "zod";
import { AddressSchema, SignatureSchema } from "../../shared/domain/address.js";
import { base58ByteLength } from "../../shared/domain/base58.js";

/**
 * A swap request mint. Beyond the base58 shape, the address must decode to the 32 bytes of a
 * Solana public key — the character range alone admits strings that decode to more, which would
 * otherwise reach the provider instead of failing pre-HTTP.
 */
const MintSchema = AddressSchema.refine(
  (value) => base58ByteLength(value) === 32,
  "mint must decode to a 32-byte Solana address",
);

/**
 * One quote request. `amount` is an exact decimal string in base units of `inputMint` — a
 * positive integer without sign, leading zeros, or exponent, because base units are never
 * rounded through a JS Number.
 */
export const SwapQuoteRequestSchema = z.object({
  inputMint: MintSchema.describe("Mint of the token to sell"),
  outputMint: MintSchema.describe("Mint of the token to buy"),
  amount: z
    .string()
    .regex(/^[1-9]\d*$/, "positive integer, in base units of inputMint")
    .describe("Input amount in base units of inputMint, as an exact decimal string"),
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
  priceImpactPct: z.string().describe('Price impact as a decimal ratio, e.g. "0.01" for 1 percent'),
  routeSummary: z.array(z.string()).describe("Human-readable hops"),
  expiresAt: z
    .number()
    .int()
    .describe(
      "Unix epoch milliseconds when solOS stops presenting the quote as usable: local receipt " +
        "time plus a 30-second local TTL, not a provider price guarantee",
    ),
  /**
   * Validated provider payload. In quote-only mode the embedded transaction is null, so raw is
   * never an executable artifact.
   */
  raw: z.unknown(),
});

/** @typedef {z.infer<typeof SwapQuoteSchema>} SwapQuote */

/** What a successful swap simulation reports: the intent echo plus the simulated cost and logs. */
export const SwapSimulationSchema = z.object({
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  amount: z.string().describe("Requested input amount in base units, echoed exactly"),
  maxSlippageBps: z.number().int().min(0).max(10_000),
  unitsConsumed: z.string().describe("Compute units the swap transaction consumed"),
  logs: z.array(z.string()),
});

/** @typedef {z.infer<typeof SwapSimulationSchema>} SwapSimulation */

/** What a confirmed swap reports: the intent echo plus the on-chain outcome. */
export const SwapExecutionSchema = z.object({
  signature: SignatureSchema,
  simulated: z.boolean().describe("Whether the exact submitted transaction was simulated first"),
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  amount: z.string(),
  maxSlippageBps: z.number().int().min(0).max(10_000),
});

/** @typedef {z.infer<typeof SwapExecutionSchema>} SwapExecution */
