// @ts-check
import { z } from "zod";
import { AddressSchema } from "./primitives.js";
import {
  LiquidityProtocolSchema,
  PositiveAmountSchema,
  PositiveDecimalSchema,
  SlippageBpsSchema,
  U64AmountSchema,
} from "./trading-primitives.js";

const traderScope = {
  traderPdaIndex: z.literal(0),
  traderSubaccountIndex: z.literal(0),
};

export const OnboardPerpActionSchema = z.object({
  type: z.literal("onboard_perp"),
  ...traderScope,
});

export const DepositPerpCollateralActionSchema = z.object({
  type: z.literal("deposit_perp_collateral"),
  ...traderScope,
  amount: PositiveAmountSchema.describe(
    "Exact wallet USDC base units to debit; received Phoenix collateral is not guaranteed",
  ),
});

export const WithdrawPerpCollateralActionSchema = z.object({
  type: z.literal("withdraw_perp_collateral"),
  ...traderScope,
  amount: PositiveAmountSchema.describe(
    "Exact Phoenix collateral-token base units to debit; received wallet USDC is not guaranteed",
  ),
});

export const OpenPerpActionSchema = z.object({
  type: z.literal("open_perp"),
  market: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,15}(?:-PERP)?$/)
    .describe("Phoenix perpetual symbol, e.g. SOL or SOL-PERP"),
  ...traderScope,
  side: z.enum(["long", "short"]),
  notionalUsd: PositiveAmountSchema.describe("Maximum notional in 1e6 USD units"),
  maxLeverage: z.number().int().min(1).max(100),
  limitPriceUsd: PositiveDecimalSchema.pipe(z.string().max(40)).describe(
    "Maximum buy or minimum sell price, USD per base token",
  ),
});

export const ClosePerpActionSchema = z.object({
  type: z.literal("close_perp"),
  market: z.string().min(1),
  ...traderScope,
  limitPriceUsd: PositiveDecimalSchema.describe(
    "Minimum sell or maximum buy price for reduce-only close",
  ),
});

const lendingIntent = {
  protocol: z.literal("kamino"),
  market: AddressSchema.describe("Configured Kamino lending market, validated by the executor"),
  mint: AddressSchema,
  amount: PositiveAmountSchema.describe("Underlying token base units"),
};
export const LendActionSchema = z.object({ type: z.literal("lend"), ...lendingIntent });
export const WithdrawLendActionSchema = z.object({
  type: z.literal("withdraw_lend"),
  ...lendingIntent,
  amount: PositiveAmountSchema.describe(
    "Target underlying base units at the read-time exchange rate; execution redeems fixed collateral units and cannot guarantee the credited underlying amount",
  ),
});

/** @typedef {z.infer<typeof LendActionSchema>} LendAction */
/** @typedef {z.infer<typeof WithdrawLendActionSchema>} WithdrawLendAction */

export const AddLiquidityActionSchema = z
  .object({
    type: z.literal("add_liquidity"),
    protocol: LiquidityProtocolSchema,
    pool: AddressSchema,
    position: AddressSchema.describe("Existing protocol position account, never NFT mint"),
    amountA: U64AmountSchema.describe("Maximum token A spend in canonical pool mint order"),
    amountB: U64AmountSchema.describe("Maximum token B spend in canonical pool mint order"),
    maxSlippageBps: SlippageBpsSchema,
  })
  .refine((value) => /[1-9]/.test(value.amountA + value.amountB), {
    message: "at least one token spend budget must be positive",
  });

export const RemoveLiquidityActionSchema = z.object({
  type: z.literal("remove_liquidity"),
  protocol: LiquidityProtocolSchema,
  position: AddressSchema.describe("Existing protocol position account, never NFT mint"),
  bps: z.number().int().min(1).max(10_000),
  maxSlippageBps: SlippageBpsSchema,
});

/** @typedef {z.infer<typeof AddLiquidityActionSchema>} AddLiquidityAction */
/** @typedef {z.infer<typeof RemoveLiquidityActionSchema>} RemoveLiquidityAction */
