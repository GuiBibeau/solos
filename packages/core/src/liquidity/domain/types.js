// @ts-check

import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

/** @typedef {import("../../shared/domain/address.js").Address} Address */
/** @typedef {z.infer<typeof import("@solos/actions").LpPositionSchema>} LpPosition */
/** @typedef {z.infer<typeof import("@solos/actions").PerpAccountSchema>} PerpAccount */

/** @typedef {z.infer<typeof LiquidityGetPositionInputSchema>} LiquidityGetPositionInput */
/** @typedef {z.infer<typeof LiquidityListPositionsInputSchema>} LiquidityListPositionsInput */

/**
 * The venue selector, mirroring the merged contract enum in `@solos/actions`
 * (trading-primitives LiquidityProtocolSchema, not exported from the published index).
 * Only `orca` has an adapter; the other values fail typed, before the network.
 */
export const LiquidityProtocolSchema = z.enum(["orca", "meteora", "raydium"]);

/**
 * One Whirlpool position read: `position` is the protocol position account (the Whirlpool
 * position PDA), never the position NFT mint and never the pool. An omitted owner means the
 * configured signer; an explicit owner is honored verbatim.
 */
export const LiquidityGetPositionInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. Only orca (Whirlpools) is implemented; meteora and raydium fail before any network access",
  ),
  position: AddressSchema.describe(
    "Protocol position-account address (the Whirlpool position PDA), never the NFT mint and never the pool",
  ),
  owner: AddressSchema.optional().describe(
    "Owner whose position NFT custody proves ownership. Defaults to the configured signer wallet",
  ),
});

/** One owner enumeration: whose LP positions to list. Omitted means the configured signer. */
export const LiquidityListPositionsInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. Only orca (Whirlpools) is implemented; meteora and raydium fail before any network access",
  ),
  owner: AddressSchema.optional().describe(
    "Owner to enumerate. Defaults to the configured signer wallet",
  ),
});

/**
 * One position read, after input validation: `owner` is always explicit (the use case
 * resolved the default from the wallet Signer).
 * @typedef {{ readonly protocol: "orca" | "meteora" | "raydium"; readonly position: Address; readonly owner: Address }} LiquidityGetPositionRequest
 */

/** One enumeration request, after input validation. @typedef {{ readonly protocol: "orca" | "meteora" | "raydium"; readonly owner: Address }} LiquidityListPositionsRequest */

/** One deposit budget: a u64 decimal string in base units, zero allowed. */
const DepositBudgetSchema = z
  .string()
  .regex(/^\d+$/, "a u64 decimal string in base units")
  .pipe(
    z
      .string()
      .refine((value) => value.length <= 20 && BigInt(value) <= 18_446_744_073_709_551_615n, {
        message: "amount exceeds u64",
      }),
  );

/** The deposit request fields before the cross-field budget rule. */
const DepositInputBaseSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. Only orca (Whirlpools) is implemented; meteora and raydium fail before any network access",
  ),
  pool: AddressSchema.describe(
    "Pool address the position belongs to; the deposit fails typed when the position references a different pool",
  ),
  position: AddressSchema.describe(
    "Existing protocol position account (the Whirlpool position PDA), never the NFT mint and never the pool; new positions are never created",
  ),
  amountA: DepositBudgetSchema.describe(
    "Maximum token A spend, in base units of the pool's canonical token A mint; unused funds stay in the wallet",
  ),
  amountB: DepositBudgetSchema.describe(
    "Maximum token B spend, in base units of the pool's canonical token B mint; unused funds stay in the wallet",
  ),
  maxSlippageBps: z
    .number()
    .int()
    .min(0)
    .max(9999)
    .default(50)
    .describe(
      "Price-movement tolerance in basis points, 0..9999. Default 50 (0.5%). Orca encodes the two budgets themselves as the on-chain spend bounds, so a price move that would overspend either budget aborts on chain",
    ),
});

/** One deposit request. The budgets are maxima, never targets; the cross-field rule that at
 * least one budget must be positive lives in the use case, beside the schema. */
export const LiquidityDepositInputSchema = DepositInputBaseSchema;

/** The execute twin adds the explicit simulation bypass, default false. */
export const LiquidityExecuteDepositInputSchema = DepositInputBaseSchema.extend({
  skipSimulation: z
    .boolean()
    .default(false)
    .describe(
      "Skip the pre-send simulation of the exact transaction. Defaults to false; bypassing only skips simulation, never validation",
    ),
});

/** @typedef {z.infer<typeof LiquidityDepositInputSchema>} LiquidityDepositInput */
/** @typedef {z.infer<typeof LiquidityExecuteDepositInputSchema>} LiquidityExecuteDepositInput */

/**
 * Complete owner enumeration (ADR-0018): every supported LP position plus the receipt mints
 * the owner holds (the position NFTs, for wallet dedup downstream). This venue holds no perp
 * exposure, so `perpAccounts` is always empty.
 * @typedef {{ readonly positions: LpPosition[]; readonly perpAccounts: PerpAccount[]; readonly receiptMints: Address[] }} LiquidityEnumeration
 */

export { LpPositionSchema } from "@solos/actions";
