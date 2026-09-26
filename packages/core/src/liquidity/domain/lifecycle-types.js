// @ts-check
/**
 * The intents that create and retire a position, as opposed to the ones that only change an
 * existing one's size. Both carry the caller's own tick range or position account: solOS
 * validates what it is given and refuses what does not fit, and never picks a range itself.
 */

import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { DepositBudgetSchema, LiquidityProtocolSchema } from "./types.js";

/**
 * One open intent. The tick range is the caller's: solOS validates it against the pool's spacing
 * and refuses an unaligned one rather than rounding, because rounding a range is choosing one.
 */
export const OpenPositionInput = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. raydium (CLMM) is implemented for opening; others fail before any network access",
  ),
  pool: AddressSchema.describe("Pool to open the position in"),
  tickLower: z
    .number()
    .int()
    .describe("Lower tick, inclusive. Must be a multiple of the pool's tick spacing"),
  tickUpper: z
    .number()
    .int()
    .describe("Upper tick, exclusive. Must be a multiple of the pool's tick spacing"),
  amountA: DepositBudgetSchema.describe("Maximum token A spend in base units; never a target"),
  amountB: DepositBudgetSchema.describe("Maximum token B spend in base units; never a target"),
  maxSlippageBps: z
    .number()
    .int()
    .min(0)
    .max(9999)
    .default(50)
    .describe("Price-movement tolerance in basis points"),
  wrapSol: z
    .boolean()
    .default(false)
    .describe(
      "Wrap exactly the native SOL the quote is short on a wSOL side, in this same transaction, and unwrap the remainder when this transaction created the account. Leave false when the wSOL side is already funded",
    ),
});

/** @typedef {z.infer<typeof OpenPositionInput>} LiquidityOpenInput */

export const ExecuteOpenPositionInput = OpenPositionInput.extend({
  skipSimulation: z.boolean().default(false).describe("Skip the pre-send simulation only"),
});

/** @typedef {z.infer<typeof ExecuteOpenPositionInput>} LiquidityExecuteOpenInput */

/** One close intent. The venue refuses while any liquidity, fee or reward is still owed. */
export const ClosePositionInput = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. raydium (CLMM) is implemented for closing; others fail before any network access",
  ),
  position: AddressSchema.describe(
    "Protocol position account to close, never the NFT mint and never the pool",
  ),
});

/** @typedef {z.infer<typeof ClosePositionInput>} LiquidityCloseInput */

export const ExecuteClosePositionInput = ClosePositionInput.extend({
  skipSimulation: z.boolean().default(false).describe("Skip the pre-send simulation only"),
});

/** @typedef {z.infer<typeof ExecuteClosePositionInput>} LiquidityExecuteCloseInput */
