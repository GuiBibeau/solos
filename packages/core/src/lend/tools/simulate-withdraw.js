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
    "Simulate redeeming an exact requested amount of underlying token base units from the " +
    "configured signer's plain Kamino supply obligation in the configured market. Reject " +
    "requests whose receipt-token conversion cannot predict the exact amount, insufficient " +
    "position or available liquidity. Does not submit; a later execution re-plans.",
  input: LendWithdrawInputSchema,
  run: (input) => simulateWithdraw(input),
});
