// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { LiquidityWithdrawInputSchema } from "../domain/types.js";
import { simulateWithdraw } from "../use-cases/simulate-withdraw.js";

export const simulateWithdrawTool = defineTool({
  name: "solana_liquidity_simulate_withdraw",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate Orca position withdrawal",
  description:
    "Simulate removing liquidity from one existing Orca Whirlpool position without " +
    "submitting anything. bps is the fraction of the position's CURRENT liquidity to " +
    "remove, 1..10000 where 10000 means all of it; fractional liquidity units round down, " +
    "and a removal computing to zero liquidity is rejected. The executor quotes the " +
    "position's underlying token A/B amounts at the current pool price and encodes minimum " +
    "receipts at those quotes minus the maxSlippageBps tolerance — the Whirlpool program " +
    "enforces them on chain, so a price move that would pay a side under its minimum aborts " +
    "instead of short-changing it. position is the protocol position account (the Whirlpool " +
    "position PDA) and the signer must hold the position NFT; the position itself is never " +
    "closed, its range is never changed, and accumulated fees or rewards are not claimed. " +
    "If a receiving token account for a side the position owes does not exist yet, an " +
    "idempotent create for it is prepended (its rent is a protocol-mandated transfer, " +
    "distinct from removed principal). The executor builds and simulates exactly the " +
    "transaction it would send, reporting compute units and program logs; nothing is ever " +
    "sent or signed for submission, and a later execute re-plans and may differ. Use " +
    "solana_liquidity_execute_withdraw to send. Only orca is implemented: meteora and " +
    "raydium fail before any network access.",
  input: LiquidityWithdrawInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (input.protocol !== "orca") {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => simulateWithdraw(input),
});
