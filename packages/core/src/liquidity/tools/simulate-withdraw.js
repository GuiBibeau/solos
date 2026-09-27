// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { SUPPORTED_VENUES } from "../domain/supported-venues.js";
import { LiquidityWithdrawInputSchema, isReadable } from "../domain/types.js";
import { simulateWithdraw } from "../use-cases/simulate-withdraw.js";

export const simulateWithdrawTool = defineTool({
  name: "solana_liquidity_simulate_withdraw",
  group: "liquidity",
  tier: "simulate",
  title: "Simulate position withdrawal",
  description:
    "Simulate removing liquidity from one existing Orca, Raydium, or Meteora position " +
    "without submitting anything. The wallet would receive token A and token B principal " +
    "quoted from the position's liquidity at the current price. Fees and rewards are not " +
    "claimed, so a Meteora withdrawal does not pay fee balances. bps is the fraction of " +
    "CURRENT liquidity to remove, 1..10000. Meteora applies that bps independently to " +
    "each occupied bin; 10000 removes every share on those bins. Fractional shares round " +
    "down, and a removal that computes to zero liquidity is rejected. Minimum receipts " +
    "are floor(quote * (10000 - maxSlippageBps) / 10000) and are encoded on chain. " +
    "Meteora also refuses on chain if the active bin moves more than ceil(maxSlippageBps " +
    "/ binStep) bins, and it does not change the position's bin range. position is the " +
    "Whirlpool PDA, the Raydium personal position, or the Meteora PositionV2 account, " +
    "never an NFT mint. The position is never closed. If a receiving token account for " +
    "a side the position owes does not exist yet, an idempotent create for it is " +
    "prepended (its rent is distinct from removed principal). The executor builds and " +
    "simulates exactly the transaction it would send. Nothing is sent. Use " +
    "solana_liquidity_execute_withdraw to send. " +
    SUPPORTED_VENUES,
  input: LiquidityWithdrawInputSchema,
  // Pure guard: dispatchers run it before the signer-bearing runtime is acquired, so a
  // supported-but-unimplemented protocol never builds the Layers at all.
  check: (input) => {
    if (!isReadable(input.protocol)) {
      throw new LiquidityUnsupportedProtocol({ protocol: input.protocol });
    }
  },
  run: (input) => simulateWithdraw(input),
});
