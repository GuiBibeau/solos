// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityExecuteWithdrawInputSchema } from "../domain/types.js";
import { executeWithdraw } from "../use-cases/execute-withdraw.js";

export const executeWithdrawTool = defineTool({
  name: "solana_liquidity_execute_withdraw",
  group: "liquidity",
  tier: "execute",
  title: "Execute Orca position withdrawal",
  description:
    "Remove liquidity from one existing Orca Whirlpool position to the configured signer " +
    "wallet and wait for confirmation. Signs and submits a real transaction that moves " +
    "funds. bps is the fraction of the position's CURRENT liquidity to remove, 1..10000 " +
    "where 10000 means all of it; fractional liquidity units round down, and a removal " +
    "computing to zero liquidity is rejected. The executor quotes the position's underlying " +
    "token A/B amounts at the current pool price and encodes minimum receipts at those " +
    "quotes minus the maxSlippageBps tolerance — the Whirlpool program enforces them on " +
    "chain, so a price move that would pay a side under its minimum aborts instead of " +
    "short-changing it. position is the protocol position account (the Whirlpool position " +
    "PDA) and the signer must hold the position NFT; the position itself is never closed, " +
    "its range is never changed, and accumulated fees or rewards are not claimed. If a " +
    "receiving token account for a side the position owes does not exist yet, an idempotent " +
    "create for it is prepended (its rent is a protocol-mandated transfer, distinct from " +
    "removed principal). Simulates the exact transaction first and sends nothing when " +
    "simulation, validation, or the blockhash lifetime fails; skipSimulation bypasses only " +
    "the simulation, never validation. Never re-sends after an ambiguous submission. Use " +
    "solana_liquidity_simulate_withdraw to preview without sending. Only orca is " +
    "implemented: meteora and raydium fail before any network access.",
  input: LiquidityExecuteWithdrawInputSchema,
  check: (input) => {
    if (input.protocol !== "orca") {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => executeWithdraw(input),
});
