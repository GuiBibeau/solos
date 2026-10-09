// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { LiquidityExecuteWithdrawInputSchema, isReadable } from "../domain/types.js";
import { executeWithdraw } from "../use-cases/execute-withdraw.js";

export const executeWithdrawTool = defineTool({
  name: "solana_liquidity_execute_withdraw",
  group: "liquidity",
  tier: "execute",
  stability: "stable",
  action: "remove_liquidity",
  title: "Execute position withdrawal",
  description:
    "Remove liquidity from one existing Orca, Raydium, or Meteora position to the " +
    "configured signer wallet and wait for confirmation. Signs and submits a real " +
    "transaction that moves funds. The wallet receives token A and token B principal " +
    "quoted from the position's liquidity at the current price. Fees and rewards are " +
    "not claimed, so Meteora fee balances stay on the position. bps is the fraction of " +
    "CURRENT liquidity to remove, 1..10000. Meteora applies that bps independently to " +
    "each occupied bin; 10000 removes every share on those bins. Fractional shares " +
    "round down, and a removal that computes to zero liquidity is rejected. Minimum " +
    "receipts are floor(quote * (10000 - maxSlippageBps) / 10000) and are encoded on " +
    "chain, so a move that would pay a side under its minimum aborts. Meteora also " +
    "refuses on chain if the active bin moves more than ceil(maxSlippageBps / binStep) " +
    "bins, and it does not change the position's bin range. position is the Whirlpool " +
    "PDA, the Raydium personal position, or the Meteora PositionV2 account, never an " +
    "NFT mint. The position is never closed. If a receiving token account for a side " +
    "the position owes does not exist yet, an idempotent create for it is prepended " +
    "(its rent is distinct from removed principal). Simulates the exact transaction " +
    "first and sends nothing when simulation, validation, or the blockhash lifetime " +
    "fails; skipSimulation bypasses only the simulation, never validation. Never " +
    "re-sends after an ambiguous submission. Use solana_liquidity_simulate_withdraw " +
    "to preview without sending. " +
    SUPPORTED_VENUES,
  input: LiquidityExecuteWithdrawInputSchema,
  check: (input) => {
    if (!isReadable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => executeWithdraw(input),
});
