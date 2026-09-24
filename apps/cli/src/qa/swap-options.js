// @ts-check
/**
 * Option and funding checks that must pass before the first provider call.
 *
 * Validating the report's shape only after the sweep is too late under `--execute`: a threshold
 * of 2 is unsatisfiable, but the schema would not say so until every round had already been
 * signed and sent. Nothing here touches the chain, so the refusal costs nothing.
 */
import { z } from "zod";

export const SwapQaOptionsSchema = z.object({
  tier: z.enum(["simulate", "execute"]),
  amountLamports: z.bigint().positive(),
  slippageBps: z.number().int().positive().max(10_000),
  rounds: z.number().int().positive().max(50),
  threshold: z.number().gt(0).max(1),
});

/** @typedef {z.infer<typeof SwapQaOptionsSchema>} SwapQaOptions */

/**
 * What one pair costs for the whole sweep, not one attempt. A wallet that funds a single round
 * but not all of them would send some swaps and then count its own depletion as venue failures,
 * corrupting the rate the run exists to produce. Simulation spends nothing, so one round's worth
 * is enough there.
 * @param {bigint} amount @param {SwapQaOptions} options
 */
export const requiredBalance = (amount, options) =>
  options.tier === "execute" ? amount * BigInt(options.rounds) : amount;
