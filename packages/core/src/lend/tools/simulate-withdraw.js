// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LendWithdrawInputSchema } from "../domain/types.js";
import { simulateWithdraw } from "../use-cases/simulate-withdraw.js";

export const simulateWithdrawTool = defineTool({
  name: "solana_lend_simulate_withdraw",
  group: "lend",
  tier: "simulate",
  title: "Simulate Kamino withdrawal",
  description:
    "Simulate redeeming collateral for a target amount of underlying token base units from the " +
    "signer's plain Kamino supply obligation. The target selects fixed receipt units; output " +
    "is estimated at the read-time exchange rate, NOT an on-chain minimum. Reject targets " +
    "that cannot be predicted exactly at that rate or exceed position/liquidity. Does not submit.",
  input: LendWithdrawInputSchema,
  run: (input) => simulateWithdraw(input),
});
