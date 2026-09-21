// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityExecuteDepositInputSchema } from "../domain/types.js";
import { executeDeposit } from "../use-cases/execute-deposit.js";

export const executeDepositTool = defineTool({
  name: "solana_liquidity_execute_deposit",
  group: "liquidity",
  tier: "execute",
  title: "Execute Orca position deposit",
  description:
    "Add liquidity to one existing Orca Whirlpool position from the configured signer wallet " +
    "and wait for confirmation. Signs and submits a real transaction that moves funds. " +
    "amountA and amountB are the maximum spends of each token in the pool's canonical mint " +
    "order; the executor computes the liquidity they can fund, rounds down to fit both " +
    "budgets, and encodes the budgets themselves as the on-chain spend bounds, so a price " +
    "move that would overspend either budget aborts instead of overrunning. position is the " +
    "protocol position account (the Whirlpool position PDA) and pool must be the pool that " +
    "position references; the signer must hold the position NFT, and new positions or ranges " +
    "are never created. Simulates the exact transaction first and sends nothing when " +
    "simulation, validation, or the blockhash lifetime fails; skipSimulation bypasses only " +
    "the simulation, never validation. Never re-sends after an ambiguous submission. Unused " +
    "funds always stay in the wallet. Use solana_liquidity_simulate_deposit to preview " +
    "without sending. Only orca is implemented: meteora and raydium fail before any network " +
    "access.",
  input: LiquidityExecuteDepositInputSchema,
  check: (input) => {
    if (input.protocol !== "orca") {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => executeDeposit(input),
});
