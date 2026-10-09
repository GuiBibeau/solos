// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { isDepositable, LiquidityExecuteDepositInputSchema } from "../domain/types.js";
import { executeDeposit } from "../use-cases/execute-deposit.js";

export const executeDepositTool = defineTool({
  name: "solana_liquidity_execute_deposit",
  group: "liquidity",
  tier: "execute",
  stability: "stable",
  action: "add_liquidity",
  title: "Execute position deposit",
  description:
    "Add liquidity to one existing Orca, Raydium, or Meteora position from the configured " +
    "signer and wait for confirmation. Signs and submits a real transaction that moves funds. " +
    "amountA and amountB are maximum spends in the pool's canonical mint order. Orca and " +
    "Raydium encode on-chain spend bounds at the quote plus slippage, capped by the budgets. " +
    "Meteora signs those amounts as the caps and spreads them across the position's existing " +
    "bins only; if the active bin moved more than ceil(maxSlippageBps / binStep) bins the " +
    "deposit is refused before send, and that check is not on chain. position is the Whirlpool " +
    "PDA, the Raydium personal position, or the Meteora PositionV2 account, never an NFT mint. " +
    "The signer holds the Orca or Raydium position NFT, or owns the Meteora position. New " +
    "positions and bin-range changes are refused. A missing funding account on a side the " +
    "quote needs nothing from is created idempotently. Simulates the exact transaction first " +
    "and sends nothing when simulation, validation, or the blockhash lifetime fails; " +
    "skipSimulation bypasses only the simulation, never validation. Use " +
    "solana_liquidity_simulate_deposit to preview. " +
    SUPPORTED_VENUES,
  input: LiquidityExecuteDepositInputSchema,
  check: (input) => {
    if (!isDepositable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => executeDeposit(input),
});
