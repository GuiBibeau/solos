// @ts-check
import { z } from "zod";
import { AmountSchema, DecimalSchema } from "./primitives.js";

export const U64AmountSchema = AmountSchema.pipe(
  z.string().refine((value) => BigInt(value) <= 18_446_744_073_709_551_615n, "amount exceeds u64"),
);
export const PositiveAmountSchema = U64AmountSchema.refine(
  (value) => /[1-9]/.test(value),
  "amount must be positive",
);
export const PositiveDecimalSchema = DecimalSchema.refine(
  (value) => !value.startsWith("-") && /[1-9]/.test(value),
  "decimal must be positive",
);
export const SlippageBpsSchema = z.number().int().min(0).max(9999);
export const LiquidityProtocolSchema = z.enum(["orca", "meteora", "raydium"]);
export const TokenDecimalsSchema = z.number().int().min(0).max(255);
