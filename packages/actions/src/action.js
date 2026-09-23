// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema } from "./primitives.js";
import { PositiveAmountSchema, SlippageBpsSchema } from "./trading-primitives.js";
import {
  AddLiquidityActionSchema,
  ClosePerpActionSchema,
  LendActionSchema,
  OpenPerpActionSchema,
  OnboardPerpActionSchema,
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
} from "./venue-actions.js";

const bps = z.number().int().min(0).max(10_000).describe("Basis points, 0 to 10000");

export const TransferSolActionSchema = z.object({
  type: z.literal("transfer_sol"),
  to: AddressSchema.describe("Recipient wallet"),
  lamports: AmountSchema.describe("Lamports to send"),
});

export const SwapActionSchema = z
  .object({
    type: z.literal("swap"),
    venue: z
      .enum(["jupiter", "pump"])
      .optional()
      .describe("Omitted means Jupiter; launch buys explicitly choose pump"),
    inputMint: AddressSchema,
    outputMint: AddressSchema,
    amount: AmountSchema.describe("Input amount in base units of inputMint"),
    maxSlippageBps: bps,
  })
  .refine(
    (action) =>
      action.venue !== "pump" || action.inputMint === "So11111111111111111111111111111111111111112",
    {
      path: ["inputMint"],
      message: "Pump buys require wSOL input identity for native-lamport budgets",
    },
  )
  .refine(
    (action) => action.venue !== "pump" || PositiveAmountSchema.safeParse(action.amount).success,
    {
      path: ["amount"],
      message: "Pump amount must be a positive u64 integer",
    },
  )
  .refine(
    (action) =>
      action.venue !== "pump" || SlippageBpsSchema.safeParse(action.maxSlippageBps).success,
    {
      path: ["maxSlippageBps"],
      message: "Pump slippage must be 0..9999 bps",
    },
  );

/** Everything an agent may ask an executor to do. Discriminated on `type`. */
export const ActionSchema = z.discriminatedUnion("type", [
  TransferSolActionSchema,
  SwapActionSchema,
  OpenPerpActionSchema,
  ClosePerpActionSchema,
  OnboardPerpActionSchema,
  LendActionSchema,
  WithdrawLendActionSchema,
  AddLiquidityActionSchema,
  RemoveLiquidityActionSchema,
]);

/** @typedef {z.infer<typeof ActionSchema>} Action */
/** @typedef {Action["type"]} ActionType */
/** @typedef {z.infer<typeof TransferSolActionSchema>} TransferSolAction */
/** @typedef {z.infer<typeof SwapActionSchema>} SwapAction */

/** @type {ReadonlyArray<ActionType>} */
export const ACTION_TYPES = [
  "transfer_sol",
  "swap",
  "open_perp",
  "close_perp",
  "onboard_perp",
  "lend",
  "withdraw_lend",
  "add_liquidity",
  "remove_liquidity",
];

export {
  AddLiquidityActionSchema,
  ClosePerpActionSchema,
  LendActionSchema,
  OpenPerpActionSchema,
  OnboardPerpActionSchema,
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
} from "./venue-actions.js";
