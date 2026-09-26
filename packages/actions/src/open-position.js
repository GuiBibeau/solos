// @ts-check
/**
 * Open a new concentrated-liquidity position at a range the caller chose.
 *
 * solOS never picks a range. Raydium takes an explicit tick window and spend budgets. Meteora
 * takes an explicit bin window and opens it empty (`initialize_position`); deposits stay on the
 * add path. A width outside 1..70, or a window past the program's bin ids, is refused rather
 * than clamped.
 */
import { z } from "zod";
import { openPositionIssue } from "./meteora-open.js";
import { AddressSchema } from "./primitives.js";
import {
  LiquidityProtocolSchema,
  SlippageBpsSchema,
  U64AmountSchema,
} from "./trading-primitives.js";

/** @param {unknown} value @param {z.RefinementCtx} ctx */
const attachOpenIssue = (value, ctx) => {
  const message = openPositionIssue(value);
  if (message !== null) ctx.addIssue({ code: "custom", message });
};

export const OpenPositionActionSchema = z
  .object({
    type: z.literal("open_position"),
    protocol: LiquidityProtocolSchema,
    pool: AddressSchema,
    tickLower: z.number().int().optional().describe("Raydium lower tick, inclusive"),
    tickUpper: z.number().int().optional().describe("Raydium upper tick, exclusive"),
    lowerBinId: z
      .number()
      .int()
      .optional()
      .describe("Meteora lower bin id, inclusive. The caller chooses it"),
    width: z
      .number()
      .int()
      .optional()
      .describe("Meteora position width in bins. Illegal widths are refused, never clamped"),
    amountA: U64AmountSchema.optional().describe("Raydium maximum token A spend"),
    amountB: U64AmountSchema.optional().describe("Raydium maximum token B spend"),
    maxSlippageBps: SlippageBpsSchema.optional(),
    wrapSol: z
      .boolean()
      .default(false)
      .describe(
        "Wrap exactly the native SOL the quote is short on a wSOL side, inside this transaction, and unwrap the remainder when this transaction created the account. False means a wSOL side must already be funded",
      ),
  })
  .superRefine(attachOpenIssue);

/** @typedef {z.infer<typeof OpenPositionActionSchema>} OpenPositionAction */
