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
 * Point reads cover orca, raydium, and meteora. Enumeration and deposits are narrower.
 */
export const LiquidityProtocolSchema = z.enum(["orca", "meteora", "raydium"]);

/**
 * Protocols with an enumeration or deposit adapter. Meteora is absent on purpose: point
 * reads landed in #140, owner enumeration is #141, and deposits stay refused.
 */
export const READ_PROTOCOLS = Object.freeze(["orca", "raydium"]);

/** @param {string} protocol */
export const isReadable = (protocol) => READ_PROTOCOLS.includes(protocol);

/**
 * Protocols with a get-position adapter. Wider than {@link READ_PROTOCOLS} by meteora.
 */
export const POSITION_READ_PROTOCOLS = Object.freeze(["orca", "raydium", "meteora"]);

/** @param {string} protocol */
export const isPositionReadable = (protocol) => POSITION_READ_PROTOCOLS.includes(protocol);

/**
 * Protocols whose positions solOS can create and retire, which is narrower than the ones it can
 * read: Orca positions are opened by a different instruction family that nothing here encodes,
 * so asking for one is refused rather than silently built against Raydium.
 */
export const LIFECYCLE_PROTOCOLS = Object.freeze(["raydium"]);

/** @param {string} protocol */
export const hasLifecycle = (protocol) => LIFECYCLE_PROTOCOLS.includes(protocol);

/**
 * One position read: `position` is the protocol position account (the Whirlpool
 * position PDA), never the position NFT mint and never the pool. An omitted owner means the
 * configured signer; an explicit owner is honored verbatim.
 */
export const LiquidityGetPositionInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) are implemented for this read. Deposits and withdrawals still reject meteora",
  ),
  position: AddressSchema.describe(
    "Protocol position-account address: the Whirlpool position PDA on orca, the PersonalPositionState PDA on raydium, the PositionV2 account on meteora. Never an NFT mint and never the pool",
  ),
  owner: AddressSchema.optional().describe(
    "Owner to prove against. Orca and Raydium require custody of the position NFT; Meteora matches the position account's owner field. Defaults to the configured signer wallet",
  ),
});

/** One owner enumeration: whose LP positions to list. Omitted means the configured signer. */
export const LiquidityListPositionsInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. orca (Whirlpools) and raydium (CLMM) are implemented; meteora fails before any network access",
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
export const DepositBudgetSchema = z
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
    "Liquidity protocol. orca (Whirlpools) and raydium (CLMM) are implemented; meteora fails before any network access",
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
      "Price-movement tolerance in basis points, 0..9999. Default 50 (0.5%). The on-chain spend bounds are the quoted amounts plus this tolerance, capped by the budgets, so a price move that would overspend either bound aborts on chain",
    ),
});

/** One deposit request. The budgets are maxima, never targets; the cross-field rule that at
 * least one budget must be positive lives in the use case, beside the schema. */
export const LiquidityDepositInputSchema = DepositInputBaseSchema;

/** One removal request: a percentage of the position's current liquidity, with explicit
 * slippage-bounded minimum receipts. The bounds live here and in the Action contract. */
export const LiquidityWithdrawInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. orca (Whirlpools) and raydium (CLMM) are implemented; meteora fails before any network access",
  ),
  position: AddressSchema.describe(
    "Protocol position-account address (the Whirlpool position PDA), never the NFT mint and never the pool; the position is never closed and its NFT is never burned",
  ),
  bps: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .describe(
      "Percentage of the position's CURRENT liquidity to remove, in basis points: 1..10000, where 10000 removes all liquidity now held. Fractional units are rounded down; a removal that computes to zero liquidity is rejected",
    ),
  maxSlippageBps: z
    .number()
    .int()
    .min(0)
    .max(9999)
    .default(50)
    .describe(
      "Price-movement tolerance in basis points, 0..9999. Default 50 (0.5%). The on-chain minimum token receipts are the quoted amounts minus this tolerance; a price move that would pay a side under its minimum aborts on chain",
    ),
});

/** The execute twin adds the explicit simulation bypass, default false. */
export const LiquidityExecuteWithdrawInputSchema = LiquidityWithdrawInputSchema.extend({
  skipSimulation: z
    .boolean()
    .default(false)
    .describe(
      "Skip the pre-send simulation of the exact transaction. Defaults to false; bypassing only skips simulation, never validation",
    ),
});

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
/** @typedef {z.infer<typeof LiquidityWithdrawInputSchema>} LiquidityWithdrawInput */
/** @typedef {z.infer<typeof LiquidityExecuteWithdrawInputSchema>} LiquidityExecuteWithdrawInput */

/**
 * Complete owner enumeration (ADR-0018): every supported LP position plus the receipt mints
 * the owner holds (the position NFTs, for wallet dedup downstream). This venue holds no perp
 * exposure, so `perpAccounts` is always empty.
 * @typedef {{ readonly positions: LpPosition[]; readonly perpAccounts: PerpAccount[]; readonly receiptMints: Address[] }} LiquidityEnumeration
 */

export { LpPositionSchema } from "@solos/actions";
