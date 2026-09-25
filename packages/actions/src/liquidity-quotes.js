// @ts-check
/**
 * The venue quotes of the liquidity family: what a removal, a deposit or an open would do at the
 * pre-send pool price, and the bounds the instruction actually encodes. These are the numbers a
 * caller reconciles a confirmed transaction against (ADR-0022).
 */
import { z } from "zod";
import { AddressSchema, AmountSchema } from "./primitives.js";

/** The planned removal's quote and encoded minimum receipts, at the pre-send pool price. */
export const LiquidityRemovalQuoteSchema = z.object({
  kind: z.literal("removal"),
  liquidity: AmountSchema.describe(
    "Exact liquidity units the plan removes from the position, u128 decimal string",
  ),
  estA: AmountSchema.describe(
    "Quoted token A proceeds at the pre-send pool price, base units decimal string",
  ),
  estB: AmountSchema.describe(
    "Quoted token B proceeds at the pre-send pool price, base units decimal string",
  ),
  minA: AmountSchema.describe(
    "Encoded on-chain minimum token A receipts, base units decimal string",
  ),
  minB: AmountSchema.describe(
    "Encoded on-chain minimum token B receipts, base units decimal string",
  ),
});

/** The planned deposit's liquidity fit and encoded spend bounds, at the pre-send pool price. */
export const LiquidityDepositQuoteSchema = z.object({
  kind: z.literal("deposit"),
  liquidity: AmountSchema.describe(
    "Exact liquidity units the plan adds to the position, u128 decimal string",
  ),
  requiredA: AmountSchema.describe(
    "Quoted token A spend at the pre-send pool price, base units decimal string",
  ),
  requiredB: AmountSchema.describe(
    "Quoted token B spend at the pre-send pool price, base units decimal string",
  ),
  tokenMaxA: AmountSchema.describe(
    "Encoded on-chain maximum token A spend, base units decimal string",
  ),
  tokenMaxB: AmountSchema.describe(
    "Encoded on-chain maximum token B spend, base units decimal string",
  ),
});

/**
 * The planned open's range, liquidity fit and encoded spend bounds, at the pre-send pool price.
 * The position NFT mint is deliberately absent: it is generated per build, so the mint a
 * simulation would use is not the one the execute signs. Read the new position back after
 * confirmation instead.
 */
export const PositionOpenQuoteSchema = z.object({
  kind: z.literal("position_open"),
  pool: AddressSchema.describe("Pool the position is opened in"),
  tickLower: z.number().int().describe("Lower tick encoded in the instruction"),
  tickUpper: z.number().int().describe("Upper tick encoded in the instruction"),
  liquidity: AmountSchema.describe(
    "Exact liquidity units the budgets buy at the pre-send pool price, u128 decimal string",
  ),
  tokenMaxA: AmountSchema.describe(
    "Encoded on-chain maximum token A spend, base units decimal string",
  ),
  tokenMaxB: AmountSchema.describe(
    "Encoded on-chain maximum token B spend, base units decimal string",
  ),
});
