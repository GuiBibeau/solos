// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema, DecimalSchema } from "./primitives.js";
import {
  LiquidityProtocolSchema,
  PerpLotDecimalsSchema,
  TokenDecimalsSchema,
} from "./trading-primitives.js";

const holding = {
  instrument: z.string().min(1).describe("Mint identity, or SOL for native lamports"),
  amount: AmountSchema,
  decimals: TokenDecimalsSchema,
  valueUsd: DecimalSchema.nullable(),
};

export const TokenPositionSchema = z.object({
  kind: z.literal("token"),
  ...holding,
  protocol: z.string().nullable(),
});

export const LendPositionSchema = z
  .object({
    kind: z.literal("lend"),
    ...holding,
    instrument: AddressSchema,
    protocol: z.literal("kamino"),
    market: AddressSchema,
    positions: z
      .array(AddressSchema)
      .refine((items) => new Set(items).size === items.length, "duplicate obligation")
      .describe("Distinct obligation accounts contributing to this mint in this market"),
  })
  .refine((value) => /^0+$/.test(value.amount) || value.positions.length > 0, {
    path: ["positions"],
    message: "nonzero lending supply requires a contributing obligation",
  });

export const PerpPositionSchema = z
  .object({
    kind: z.literal("perp"),
    protocol: z.literal("phoenix"),
    account: AddressSchema.describe("Trader account; shared equity is in perpAccounts"),
    instrument: z.string().min(1),
    side: z.enum(["long", "short", "flat"]),
    amount: AmountSchema.describe("Absolute base exposure; direction is side"),
    decimals: PerpLotDecimalsSchema.describe(
      "Lot-size exponent; uiAmount = amount x 10^decimals, negative is a lot smaller than one token",
    ),
    valueUsd: z.null().describe("Never notional; count shared account equity once instead"),
  })
  .refine((value) => /^0+$/.test(value.amount) === (value.side === "flat"), {
    message: "zero exposure must be flat; nonzero exposure must be long or short",
  });

const underlying = z.object({
  mint: AddressSchema,
  amount: AmountSchema,
  decimals: TokenDecimalsSchema,
});
export const LpPositionSchema = z
  .object({
    kind: z.literal("lp"),
    protocol: LiquidityProtocolSchema,
    position: AddressSchema,
    instrument: AddressSchema.describe("Pool identity"),
    liquidity: AmountSchema.describe("Protocol raw liquidity shares, never a token amount"),
    tokenA: underlying,
    tokenB: underlying,
    valueUsd: DecimalSchema.nullable(),
  })
  .refine(
    (value) =>
      value.protocol === "meteora" ||
      (/^\d+$/.test(value.liquidity) && BigInt(value.liquidity) <= (1n << 128n) - 1n),
    {
      message: "Orca/Raydium liquidity exceeds u128",
    },
  );

export const PerpAccountSchema = z.object({
  protocol: z.literal("phoenix"),
  account: AddressSchema,
  equityUsd: DecimalSchema.nullable().describe(
    "Signed USD equity including settled/unsettled PnL and funding; null if unavailable",
  ),
});

export const PositionSchema = z.discriminatedUnion("kind", [
  TokenPositionSchema,
  LendPositionSchema,
  PerpPositionSchema,
  LpPositionSchema,
]);
/** @typedef {z.infer<typeof PositionSchema>} Position */
