// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import { PortfolioStateSchema } from "./portfolio.js";
import {
  AddressSchema,
  AmountSchema,
  DecimalSchema,
  SignatureSchema,
  TimestampSchema,
} from "./primitives.js";

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

/** The venue quote of one planned lend deposit, or null for actions without one. */
export const LendDepositQuoteSchema = z.object({
  kind: z.literal("lend_deposit"),
  reserve: AddressSchema.describe("The reserve the deposit targets in the configured market"),
  obligation: AddressSchema.describe(
    "The signer's plain supply obligation receiving the collateral",
  ),
  liquidityAmount: AmountSchema.describe(
    "Exact underlying base units encoded in the deposit instruction",
  ),
  estimatedCollateral: AmountSchema.describe(
    "Collateral base units the deposit is predicted to mint at the read-time reserve exchange rate, rounded down; the on-chain outcome may differ",
  ),
  exchangeRate: DecimalSchema.describe(
    "Reserve collateral exchange rate observed at read time, collateral per liquidity as a decimal string",
  ),
  initializeObligation: z
    .boolean()
    .describe("Whether the transaction initializes the obligation (and its user metadata)"),
  rentLamports: AmountSchema.describe(
    "Rent-exempt lamports for accounts the transaction initializes, zero when none",
  ),
  feeLamports: AmountSchema.describe(
    "Transaction fee at the flat per-signature rate, before priority fees",
  ),
});

/** The venue quote of one planned liquidity action, or null for actions without one. */
export const VenueQuoteSchema = z
  .discriminatedUnion("kind", [
    LiquidityRemovalQuoteSchema,
    LiquidityDepositQuoteSchema,
    LendDepositQuoteSchema,
  ])
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
    "For liquidity and lend actions: the plan's quoted amounts, the exact bounds encoded in the instruction, and pre-send rent/fee evidence, at the pre-send state; null for every other action",
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
/** @typedef {z.infer<typeof LendDepositQuoteSchema>} LendDepositQuote */
/** @typedef {z.infer<typeof VenueQuoteSchema>} VenueQuote */
