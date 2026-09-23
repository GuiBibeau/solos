// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LendExecuteWithdrawInputSchema } from "../domain/types.js";
import { executeWithdraw } from "../use-cases/execute-withdraw.js";

export const executeWithdrawTool = defineTool({
  name: "solana_lend_execute_withdraw",
  group: "lend",
  tier: "execute",
  title: "Execute Kamino withdrawal",
  description:
    "Redeem the requested underlying base-unit amount from the configured signer's plain " +
    "Kamino supply obligation. The executor checks the reserve, position, receipt conversion " +
    "and liquidity before signing. Simulates the exact signed transaction first unless " +
    "skipSimulation is true; a failed simulation sends nothing. Confirmation is not proof " +
    "of exact credited tokens: read the wallet and remaining position after execution. " +
    "Never retries an ambiguous submission.",
  input: LendExecuteWithdrawInputSchema,
  run: (input) => executeWithdraw(input),
});
