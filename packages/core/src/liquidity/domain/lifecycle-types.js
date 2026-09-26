// @ts-check
/**
 * The intents that create and retire a position, as opposed to the ones that only change an
 * existing one's size. The caller names the range: ticks on raydium, a bin window on meteora.
 * solOS validates what it is given and refuses what does not fit, and never picks a range itself.
 */

import { openPositionIssue } from "@solos/actions";
import { z } from "zod";
import { AddressSchema } from "../../shared/domain/address.js";
import { DepositBudgetSchema, LiquidityProtocolSchema } from "./types.js";

/** @param {unknown} value @param {z.RefinementCtx} ctx */
const attachOpenIssue = (value, ctx) => {
  const message = openPositionIssue(value);
  if (message !== null) ctx.addIssue({ code: "custom", message });
};

/**
 * One open intent. Raydium takes ticks and spend budgets. Meteora takes `lowerBinId` and
 * `width` and opens an empty position; an illegal width is refused, never clamped.
 */
export const OpenPositionInput = z
  .object({
    protocol: LiquidityProtocolSchema.describe(
      "Liquidity protocol. raydium (CLMM) and meteora (DLMM) can open a position; orca fails before any network access",
    ),
    pool: AddressSchema.describe(
      "Pool to open the position in. On meteora this is the LbPair address",
    ),
    tickLower: z
      .number()
      .int()
      .optional()
      .describe("Raydium lower tick, inclusive. Must be a multiple of the pool's tick spacing"),
    tickUpper: z
      .number()
      .int()
      .optional()
      .describe("Raydium upper tick, exclusive. Must be a multiple of the pool's tick spacing"),
    lowerBinId: z
      .number()
      .int()
      .optional()
      .describe("Meteora lower bin id, inclusive. The caller chooses it; solOS does not"),
    width: z
      .number()
      .int()
      .optional()
      .describe(
        "Meteora position width in bins, an integer from 1 to 70. An illegal width is refused, never clamped",
      ),
    amountA: DepositBudgetSchema.optional().describe(
      "Raydium maximum token A spend in base units; never a target",
    ),
    amountB: DepositBudgetSchema.optional().describe(
      "Raydium maximum token B spend in base units; never a target",
    ),
    maxSlippageBps: z
      .number()
      .int()
      .min(0)
      .max(9999)
      .default(50)
      .describe(
        "Raydium price-movement tolerance in basis points. Ignored by an empty meteora open",
      ),
    wrapSol: z
      .boolean()
      .default(false)
      .describe(
        "Wrap exactly the native SOL the quote is short on a wSOL side, in this same transaction, and unwrap the remainder when this transaction created the account. Leave false when the wSOL side is already funded",
      ),
  })
  .superRefine(attachOpenIssue);

/** @typedef {z.infer<typeof OpenPositionInput>} LiquidityOpenInput */

// Zod 4 rejects `.extend()` on an object that already has checks. `safeExtend` keeps the
// open refinement and adds `skipSimulation` without dropping it.
export const ExecuteOpenPositionInput = OpenPositionInput.safeExtend({
  skipSimulation: z.boolean().default(false).describe("Skip the pre-send simulation only"),
});

/** @typedef {z.infer<typeof ExecuteOpenPositionInput>} LiquidityExecuteOpenInput */

/** One close intent. Meteora refuses while any liquidity share remains. */
export const ClosePositionInput = z.object({
  protocol: LiquidityProtocolSchema.describe(
    "Liquidity protocol. raydium (CLMM) and meteora (DLMM) can close an emptied position; orca fails before any network access",
  ),
  position: AddressSchema.describe(
    "Protocol position account to close. On meteora this is the PositionV2 account, never an NFT mint and never the pool",
  ),
});

/** @typedef {z.infer<typeof ClosePositionInput>} LiquidityCloseInput */

export const ExecuteClosePositionInput = ClosePositionInput.extend({
  skipSimulation: z.boolean().default(false).describe("Skip the pre-send simulation only"),
});

/** @typedef {z.infer<typeof ExecuteClosePositionInput>} LiquidityExecuteCloseInput */
