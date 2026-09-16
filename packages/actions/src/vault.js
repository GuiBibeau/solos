// @ts-check
import { z } from "zod";
import { AddressSchema, AmountSchema, DecimalSchema, TimestampSchema } from "./primitives.js";

/** For vault consumers only. Nothing in solOS core requires this. */
export const VaultStateSchema = z.object({
  vaultId: z.string().min(1),
  navUsd: DecimalSchema,
  shares: AmountSchema,
  mandateId: z.string().min(1),
  executor: AddressSchema.describe("Account allowed to execute for this vault"),
  paused: z.boolean(),
  at: TimestampSchema,
});

/** @typedef {z.infer<typeof VaultStateSchema>} VaultState */
