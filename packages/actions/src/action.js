// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema } from "./primitives.js";

const bps = z.number().int().min(0).max(10_000).describe("Basis points, 0 to 10000");

export const TransferSolActionSchema = z.object({
  type: z.literal("transfer_sol"),
  to: AddressSchema.describe("Recipient wallet"),
  lamports: AmountSchema.describe("Lamports to send"),
});

export const SwapActionSchema = z.object({
  type: z.literal("swap"),
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  amount: AmountSchema.describe("Input amount in base units of inputMint"),
  maxSlippageBps: bps,
});

export const OpenPerpActionSchema = z.object({
  type: z.literal("open_perp"),
  market: z.string().min(1).describe("Perp market symbol, e.g. SOL-PERP"),
  side: z.enum(["long", "short"]),
  notionalUsd: AmountSchema.describe("Notional in USD base units (1e6)"),
  maxLeverage: z.number().positive().max(100),
});

export const ClosePerpActionSchema = z.object({
  type: z.literal("close_perp"),
  market: z.string().min(1),
});

const lendingProtocol = z.enum(["kamino"]);

export const LendActionSchema = z.object({
  type: z.literal("lend"),
  protocol: lendingProtocol,
  mint: AddressSchema,
  amount: AmountSchema,
});

export const WithdrawLendActionSchema = z.object({
  type: z.literal("withdraw_lend"),
  protocol: lendingProtocol,
  mint: AddressSchema,
  amount: AmountSchema,
});

/** Everything an agent may ask an executor to do. Discriminated on `type`. */
export const ActionSchema = z.discriminatedUnion("type", [
  TransferSolActionSchema,
  SwapActionSchema,
  OpenPerpActionSchema,
  ClosePerpActionSchema,
  LendActionSchema,
  WithdrawLendActionSchema,
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
];
