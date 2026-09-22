// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import { PortfolioStateSchema } from "./portfolio.js";
import { AmountSchema, SignatureSchema, TimestampSchema } from "./primitives.js";

export const ViolationSchema = z.object({
  rule: z.string().min(1),
  message: z.string(),
});

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

/** The venue quote of one planned liquidity action, or null for actions without one. */
export const VenueQuoteSchema = z
  .discriminatedUnion("kind", [LiquidityRemovalQuoteSchema, LiquidityDepositQuoteSchema])
  .nullable()
  .default(null);

/** Returned by every executor's `simulate`. `ok: false` means the action would fail or is refused. */
export const SimulationResultSchema = z.object({
  action: ActionSchema,
  ok: z.boolean(),
  unitsConsumed: AmountSchema.describe("Compute units the transaction would consume"),
  logs: z.array(z.string()),
  projectedPortfolio: PortfolioStateSchema.nullable(),
  venueQuote: VenueQuoteSchema.describe(
    "For liquidity actions: the plan's quoted amounts and the exact bounds encoded in the instruction, at the pre-send pool price; null for every other action",
  ),
  violations: z.array(ViolationSchema),
});

/** Returned by every executor's `execute`. */
export const ExecutionResultSchema = z.object({
  action: ActionSchema,
  status: z.enum(["confirmed", "rejected", "failed"]),
  signature: SignatureSchema.nullable(),
  executedAt: TimestampSchema,
  simulated: z.boolean().describe("Whether a simulation ran before sending"),
  error: z.string().nullable(),
});

/** @typedef {z.infer<typeof ViolationSchema>} Violation */
/** @typedef {z.infer<typeof SimulationResultSchema>} SimulationResult */
/** @typedef {z.infer<typeof ExecutionResultSchema>} ExecutionResult */

/** @typedef {z.infer<typeof LiquidityRemovalQuoteSchema>} LiquidityRemovalQuote */
/** @typedef {z.infer<typeof LiquidityDepositQuoteSchema>} LiquidityDepositQuote */
/** @typedef {z.infer<typeof VenueQuoteSchema>} VenueQuote */
