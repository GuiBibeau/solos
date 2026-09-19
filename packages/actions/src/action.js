// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema } from "./primitives.js";
import {
  AddLiquidityActionSchema,
  ClosePerpActionSchema,
  LendActionSchema,
  OpenPerpActionSchema,
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
} from "./venue-actions.js";

const bps = z.number().int().min(0).max(10_000).describe("Basis points, 0 to 10000");

export const TransferSolActionSchema = z.object({
  type: z.literal("transfer_sol"),
  to: AddressSchema.describe("Recipient wallet"),
  lamports: AmountSchema.describe("Lamports to send"),
});

export const SwapActionSchema = z.object({
  type: z.literal("swap"),
  venue: z
    .enum(["jupiter", "pump"])
    .optional()
    .describe("Omitted means Jupiter; launch buys explicitly choose pump"),
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  amount: AmountSchema.describe("Input amount in base units of inputMint"),
  maxSlippageBps: bps,
});

/** Everything an agent may ask an executor to do. Discriminated on `type`. */
export const ActionSchema = z.discriminatedUnion("type", [
  TransferSolActionSchema,
  SwapActionSchema,
  OpenPerpActionSchema,
  ClosePerpActionSchema,
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
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
} from "./venue-actions.js";
