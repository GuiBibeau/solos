// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { isDepositable, LiquidityDepositInputSchema } from "../domain/types.js";
import { simulateDeposit } from "../use-cases/simulate-deposit.js";

export const simulateDepositTool = defineTool({
  name: "solana_liquidity_simulate_deposit",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate position deposit",
  description:
    "Simulate adding liquidity to one existing Orca, Raydium, or Meteora position without " +
    "submitting anything. amountA and amountB are maximum spends in the pool's canonical mint " +
    "order. Orca and Raydium encode on-chain spend bounds at the quote plus slippage, capped " +
    "by the budgets. Meteora signs those amounts as the caps and spreads them across the " +
    "position's existing bins only; if the active bin moved more than ceil(maxSlippageBps / " +
    "binStep) bins the deposit is refused before send, and that check is not on chain. " +
    "position is the Whirlpool PDA, the Raydium personal position, or the Meteora PositionV2 " +
    "account, never an NFT mint. The signer holds the Orca or Raydium position NFT, or owns " +
    "the Meteora position. New positions and bin-range changes are refused. A missing funding " +
    "account on a side the quote needs nothing from is created idempotently. The executor " +
    "builds and simulates exactly the transaction it would send. Nothing is sent. Use " +
    "solana_liquidity_execute_deposit to send. Withdrawals still reject meteora.",
  input: LiquidityDepositInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (!isDepositable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => simulateDeposit(input),
});
