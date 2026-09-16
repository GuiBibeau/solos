// @ts-check
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

export const TokenBalanceSchema = z.object({
  mint: AddressSchema.describe("Token mint address"),
  tokenAccount: AddressSchema.describe("Token account holding the balance"),
  program: z.enum(["token", "token-2022"]).describe("Owning token program"),
  amount: z.string().regex(/^\d+$/).describe("Raw amount in base units"),
  decimals: z.number().int().min(0).max(18),
  uiAmount: z.string().describe("Human-readable amount, decimals applied"),
});

/** @typedef {z.infer<typeof TokenBalanceSchema>} TokenBalance */

export const WalletBalancesSchema = z.object({
  owner: AddressSchema,
  lamports: z.string().regex(/^\d+$/).describe("SOL balance in lamports"),
  sol: z.string().describe("SOL balance as decimal"),
  tokens: z.array(TokenBalanceSchema),
});

/** @typedef {z.infer<typeof WalletBalancesSchema>} WalletBalances */
