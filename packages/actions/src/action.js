// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema } from "./primitives.js";
import { PositiveAmountSchema, SlippageBpsSchema } from "./trading-primitives.js";
import {
  AddLiquidityActionSchema,
  ClosePerpActionSchema,
  DepositPerpCollateralActionSchema,
  LendActionSchema,
  OpenPerpActionSchema,
  OnboardPerpActionSchema,
  ClosePositionActionSchema,
  OpenPositionActionSchema,
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
  WithdrawPerpCollateralActionSchema,
} from "./venue-actions.js";

const bps = z.number().int().min(0).max(10_000).describe("Basis points, 0 to 10000");

export const TransferSolActionSchema = z.object({
  type: z.literal("transfer_sol"),
  to: AddressSchema.describe("Recipient wallet"),
  lamports: AmountSchema.describe("Lamports to send"),
});

/** Native SOL's wrapped mint, the only quote asset a pump curve trades against. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** How many sides of one swap are wSOL: 0, 1, or 2 when a caller names it twice. */
/** @param {{ inputMint: string; outputMint: string }} action */
const solSides = (action) =>
  (action.inputMint === WSOL_MINT ? 1 : 0) + (action.outputMint === WSOL_MINT ? 1 : 0);

export const SwapActionSchema = z
  .object({
    type: z.literal("swap"),
    venue: z
      .enum(["jupiter", "pump"])
      .optional()
      .describe("Omitted means Jupiter; launch buys and sells explicitly choose pump"),
    inputMint: AddressSchema,
    outputMint: AddressSchema,
    amount: AmountSchema.describe("Input amount in base units of inputMint"),
    maxSlippageBps: bps,
  })
  // A pump curve always trades its coin against SOL, so exactly one side is wSOL: the input on a
  // buy, the output on a sell. Requiring it on exactly one side rather than only on the input
  // admits the sell while still refusing to express an arbitrary token-to-token route through
  // this venue.
  .refine((action) => action.venue !== "pump" || solSides(action) === 1, {
    path: ["inputMint"],
    message: "A pump swap must have wSOL on exactly one side: input to buy, output to sell",
  })
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
  DepositPerpCollateralActionSchema,
  WithdrawPerpCollateralActionSchema,
  LendActionSchema,
  WithdrawLendActionSchema,
  AddLiquidityActionSchema,
  RemoveLiquidityActionSchema,
  OpenPositionActionSchema,
  ClosePositionActionSchema,
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
  "deposit_perp_collateral",
  "withdraw_perp_collateral",
  "lend",
  "withdraw_lend",
  "add_liquidity",
  "remove_liquidity",
  "open_position",
  "close_position",
];

export {
  AddLiquidityActionSchema,
  ClosePerpActionSchema,
  ClosePositionActionSchema,
  DepositPerpCollateralActionSchema,
  LendActionSchema,
  OpenPerpActionSchema,
  OnboardPerpActionSchema,
  OpenPositionActionSchema,
  RemoveLiquidityActionSchema,
  WithdrawLendActionSchema,
  WithdrawPerpCollateralActionSchema,
} from "./venue-actions.js";
