// @ts-check
import { z } from "zod";
import { AmountSchema } from "./primitives.js";

/** Simulated fixed input and estimated, non-guaranteed receipt. No on-chain minimum exists. */
export const PerpCollateralQuoteSchema = z.object({
  kind: z.literal("perp_collateral"),
  direction: z.enum(["deposit", "withdraw"]),
  inputAmount: AmountSchema.describe("Exact encoded input token base units"),
  estimatedOutput: AmountSchema.describe("Pre-send estimated output, NOT a guaranteed minimum"),
  estimatedFeeLamports: AmountSchema.describe(
    "Pre-send estimated signature fee and rent, not a cap",
  ),
  guaranteedMinimumOutput: z.literal(false),
});

/** Confirmed post-read actual deltas, signed decimal strings. */
export const PerpCollateralReconciliationSchema = z.object({
  kind: z.literal("perp_collateral"),
  walletUsdcDelta: z
    .string()
    .regex(/^-?(0|[1-9]\d*)$/)
    .describe("Confirmed wallet USDC token delta in base units"),
  traderCollateralDelta: z
    .string()
    .regex(/^-?(0|[1-9]\d*)$/)
    .describe("Confirmed trader quote collateral delta in base units"),
  payerLamportsDelta: z
    .string()
    .regex(/^-?(0|[1-9]\d*)$/)
    .describe("Confirmed fee payer SOL delta in lamports, including rent"),
});
