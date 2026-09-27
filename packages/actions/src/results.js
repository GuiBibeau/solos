// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import {
  LiquidityDepositQuoteSchema,
  LiquidityRemovalQuoteSchema,
  MeteoraPositionOpenQuoteSchema,
  PositionOpenQuoteSchema,
} from "./liquidity-quotes.js";
import {
  PerpCollateralQuoteSchema,
  PerpCollateralReconciliationSchema,
} from "./perp-collateral-results.js";
import { PortfolioStateSchema } from "./portfolio.js";
export {
  LiquidityDepositQuoteSchema,
  LiquidityRemovalQuoteSchema,
  MeteoraPositionOpenQuoteSchema,
  PositionOpenQuoteSchema,
} from "./liquidity-quotes.js";
export {
  PerpCollateralQuoteSchema,
  PerpCollateralReconciliationSchema,
} from "./perp-collateral-results.js";
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

/** Read-time withdrawal conversion; the instruction encodes collateral, not underlying. */
export const LendWithdrawQuoteSchema = z.object({
  kind: z.literal("lend_withdraw"),
  reserve: AddressSchema.describe("Validated reserve in the configured Kamino market"),
  obligation: AddressSchema.describe("Signer's validated plain supply obligation"),
  requestedLiquidity: AmountSchema.describe(
    "Target underlying base units at the read-time rate, not an on-chain guaranteed output",
  ),
  collateralAmount: AmountSchema.describe(
    "Exact receipt units encoded in the withdrawal instruction",
  ),
  estimatedLiquidity: AmountSchema.describe(
    "Estimated underlying output for the fixed collateral input; actual credited units can differ at inclusion",
  ),
  exchangeRate: DecimalSchema.describe("Observed collateral per underlying exchange rate"),
  rentLamports: AmountSchema.describe(
    "Rent for a newly initialized obligation farm account, zero when already present",
  ),
  feeLamports: AmountSchema.describe("Flat signature fee before priority fees"),
});

/** Read-time wallet debit estimate for one Phoenix trader registration, including a fee cushion. */
export const PerpOnboardQuoteSchema = z.object({
  kind: z.literal("perp_onboard"),
  estimatedSpendLamports: AmountSchema.describe(
    "Read-time wallet balance debit from the simulated transaction, plus 10000 lamports for up to two signatures; not an on-chain cap",
  ),
});

/** What closing one token account returns to its owner, read before signing. */
export const TokenAccountCloseQuoteSchema = z.object({
  kind: z.literal("token_account_close"),
  account: AddressSchema,
  mint: AddressSchema,
  tokenProgram: AddressSchema.describe(
    "Token or Token-2022, read from the account's on-chain owner, never assumed",
  ),
  returnedLamports: AmountSchema.describe(
    "Every lamport the account holds, returned to the owner: its rent, plus the wrapped balance of a wrapped-SOL account",
  ),
  unwrappedLamports: AmountSchema.describe(
    "The wrapped-SOL balance that becomes native SOL; 0 for every other mint",
  ),
});

/** The venue quote of one planned liquidity action, or null for actions without one. */
export const VenueQuoteSchema = z
  .discriminatedUnion("kind", [
    PerpOnboardQuoteSchema,
    PerpCollateralQuoteSchema,
    LiquidityRemovalQuoteSchema,
    LiquidityDepositQuoteSchema,
    MeteoraPositionOpenQuoteSchema,
    PositionOpenQuoteSchema,
    LendDepositQuoteSchema,
    LendWithdrawQuoteSchema,
    TokenAccountCloseQuoteSchema,
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
    "For liquidity, lend and token-account actions: the plan's quoted amounts, the exact bounds encoded in the instruction, and pre-send rent/fee evidence, at the pre-send state; null for every other action",
  ),
  violations: z.array(ViolationSchema),
});

/** Returned by every executor's `execute`. */
export const ExecutionResultSchema = z.object({
  reconciliation: PerpCollateralReconciliationSchema.optional().describe(
    "Present only after post-confirmation wallet and trader reads; not inferred from signature",
  ),
  action: ActionSchema,
  status: z.enum(["confirmed", "rejected", "failed"]),
  signature: SignatureSchema.nullable(),
  executedAt: TimestampSchema,
  simulated: z.boolean().describe("Whether a simulation ran before sending"),
  error: z.string().nullable(),
  position: AddressSchema.optional().describe(
    "The position account a confirmed open created: a Meteora PositionV2 or a Raydium personal position. A generated secret key is never returned. Absent for every other action",
  ),
});

/** @typedef {z.infer<typeof ViolationSchema>} Violation */
/** @typedef {z.infer<typeof SimulationResultSchema>} SimulationResult */
/** @typedef {z.infer<typeof ExecutionResultSchema>} ExecutionResult */

/** @typedef {z.infer<typeof LiquidityRemovalQuoteSchema>} LiquidityRemovalQuote */
/** @typedef {z.infer<typeof LiquidityDepositQuoteSchema>} LiquidityDepositQuote */
/** @typedef {z.infer<typeof PositionOpenQuoteSchema>} PositionOpenQuote */
/** @typedef {z.infer<typeof MeteoraPositionOpenQuoteSchema>} MeteoraPositionOpenQuote */
/** @typedef {z.infer<typeof LendDepositQuoteSchema>} LendDepositQuote */
/** @typedef {z.infer<typeof LendWithdrawQuoteSchema>} LendWithdrawQuote */
/** @typedef {z.infer<typeof PerpOnboardQuoteSchema>} PerpOnboardQuote */
/** @typedef {z.infer<typeof TokenAccountCloseQuoteSchema>} TokenAccountCloseQuote */
/** @typedef {z.infer<typeof PerpCollateralQuoteSchema>} PerpCollateralQuote */
/** @typedef {z.infer<typeof PerpCollateralReconciliationSchema>} PerpCollateralReconciliation */
/** @typedef {z.infer<typeof VenueQuoteSchema>} VenueQuote */
