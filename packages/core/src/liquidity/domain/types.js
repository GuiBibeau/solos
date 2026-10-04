// @ts-check

import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";

/** @typedef {import("../../shared/domain/address.js").Address} Address */
/** @typedef {z.infer<typeof import("@solos-sh/actions").LpPositionSchema>} LpPosition */
/** @typedef {z.infer<typeof import("@solos-sh/actions").PerpAccountSchema>} PerpAccount */

/** @typedef {z.infer<typeof LiquidityGetPositionInputSchema>} LiquidityGetPositionInput */
/** @typedef {z.infer<typeof LiquidityListPositionsInputSchema>} LiquidityListPositionsInput */

/**
 * The venue selector, mirroring the merged contract enum in `@solos-sh/actions`
 * (trading-primitives LiquidityProtocolSchema, not exported from the published index).
 * Point reads, deposits, withdrawals, and owner enumeration cover orca, raydium, and meteora.
 * Opens and closes cover raydium and an empty meteora position.
 */
export const LiquidityProtocolSchema = z.enum(["orca", "meteora", "raydium"]);

/**
 * Protocols with a withdrawal adapter. Deposits are {@link DEPOSIT_PROTOCOLS}. Owner
 * enumeration is {@link ENUMERATION_PROTOCOLS}.
 */
export const READ_PROTOCOLS = Object.freeze(["orca", "raydium", "meteora"]);

/** @param {string} protocol */
export const isReadable = (protocol) => READ_PROTOCOLS.includes(protocol);

/** Protocols with a deposit adapter. Withdrawals are {@link READ_PROTOCOLS}. */
export const DEPOSIT_PROTOCOLS = Object.freeze(["orca", "raydium", "meteora"]);

/** @param {string} protocol */
export const isDepositable = (protocol) => DEPOSIT_PROTOCOLS.includes(protocol);

/**
 * Protocols with an owner-enumeration adapter. Each venue keeps its own candidate bound.
 * Meteora positions are program accounts, not NFT receipts.
 */
export const ENUMERATION_PROTOCOLS = Object.freeze(["orca", "raydium", "meteora"]);

/** @param {string} protocol */
export const isEnumerable = (protocol) => ENUMERATION_PROTOCOLS.includes(protocol);

/**
 * Protocols with a get-position adapter. Same set as {@link ENUMERATION_PROTOCOLS}.
 */
export const POSITION_READ_PROTOCOLS = Object.freeze(["orca", "raydium", "meteora"]);

/** @param {string} protocol */
export const isPositionReadable = (protocol) => POSITION_READ_PROTOCOLS.includes(protocol);

/**
 * Protocols whose positions solOS can create and retire, which is narrower than the ones it can
 * read: Orca positions are opened by a different instruction family that nothing here encodes,
 * so asking for one is refused rather than silently built against Raydium.
 */
export const LIFECYCLE_PROTOCOLS = Object.freeze(["raydium", "meteora"]);

/** @param {string} protocol */
export const hasLifecycle = (protocol) => LIFECYCLE_PROTOCOLS.includes(protocol);

/**
 * One position read: `position` is the protocol position account (the Whirlpool
 * position PDA), never the position NFT mint and never the pool. An omitted owner means the
 * configured signer; an explicit owner is honored verbatim.
 */
export const LiquidityGetPositionInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) are implemented for this read. Deposits and withdrawals stay inside the position's existing bins. Opens and closes cover raydium and an empty meteora position",
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
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) are implemented for owner enumeration. Deposits and withdrawals stay inside the position's existing bins. Opens and closes cover raydium and an empty meteora position",
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
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) deposits are implemented. Opens and closes cover raydium and an empty meteora position",
  ),
  pool: AddressSchema.describe(
    "Pool address the position belongs to; the deposit fails typed when the position references a different pool",
  ),
  position: AddressSchema.describe(
    "Existing protocol position account: the Whirlpool position PDA, the Raydium personal position, or the Meteora PositionV2 account. Never an NFT mint and never the pool. New positions and bin-range changes are refused",
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
      "Price-movement tolerance in basis points, 0..9999. Default 50 (0.5%). Orca and Raydium encode on-chain spend bounds at the quote plus this tolerance, capped by the budgets. Meteora caps spend at the signed token amounts and refuses before send if the active bin moved more than ceil(maxSlippageBps / binStep) bins; that drift check is not on chain",
    ),
  wrapSol: z
    .boolean()
    .default(false)
    .describe(
      "Wrap exactly the native SOL the quote is short on a wSOL side, in this same transaction, and unwrap the remainder when this transaction created the account. Leave false when the wSOL side is already funded",
    ),
});

/** One deposit request. The budgets are maxima, never targets; the cross-field rule that at
 * least one budget must be positive lives in the use case, beside the schema. */
export const LiquidityDepositInputSchema = DepositInputBaseSchema;

/** One removal request: a percentage of the position's current liquidity, with explicit
 * slippage-bounded minimum receipts. The bounds live here and in the Action contract. */
export const LiquidityWithdrawInputSchema = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) withdrawals are implemented. Opens and closes cover raydium and an empty meteora position",
  ),
  position: AddressSchema.describe(
    "Protocol position account: the Whirlpool PDA, the Raydium personal position, or the Meteora PositionV2 account (its owner field). Never an NFT mint and never the pool. The position is not closed and its range is not changed",
  ),
  bps: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .describe(
      "Fraction of the position's CURRENT liquidity to remove, in basis points: 1..10000. Meteora applies it independently to each occupied bin. 10000 removes every share. Fractional shares round down; a removal that computes to zero liquidity is rejected",
    ),
  maxSlippageBps: z
    .number()
    .int()
    .min(0)
    .max(9999)
    .default(50)
    .describe(
      "Price-movement tolerance in basis points, 0..9999. Default 50 (0.5%). Minimum receipts are floor(quoted principal * (10000 - tolerance) / 10000) and are encoded on chain. The quote is liquidity principal only: Meteora does not claim fees or rewards in this transaction. Meteora also refuses on chain if the active bin moves more than ceil(maxSlippageBps / binStep) bins",
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

export { LpPositionSchema } from "@solos-sh/actions";
