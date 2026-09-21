// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityDepositInputSchema } from "../domain/types.js";
import { simulateDeposit } from "../use-cases/simulate-deposit.js";

export const simulateDepositTool = defineTool({
  name: "solana_liquidity_simulate_deposit",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate Orca position deposit",
  description:
    "Simulate adding liquidity to one existing Orca Whirlpool position without submitting " +
    "anything. amountA and amountB are the maximum spends of each token in the pool's " +
    "canonical mint order; the executor computes the liquidity they can fund, rounds down to " +
    "fit both budgets, and encodes the budgets themselves as the on-chain spend bounds, so a " +
    "price move that would overspend aborts. position is the protocol position account (the " +
    "Whirlpool position PDA) and pool must be the pool that position references; the signer " +
    "must hold the position NFT, and new positions or ranges are never created. The executor " +
    "builds and simulates exactly the transaction it would send, reporting compute units and " +
    "program logs; unused funds always stay in the wallet. Nothing is ever sent or signed for " +
    "submission, and a later execute re-plans and may differ. Use " +
    "solana_liquidity_execute_deposit to send. Only orca is implemented: meteora and raydium " +
    "fail before any network access.",
  input: LiquidityDepositInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (input.protocol !== "orca") {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => simulateDeposit(input),
});
