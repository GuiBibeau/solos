// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LendExecuteWithdrawInputSchema } from "../domain/types.js";
import { executeWithdraw } from "../use-cases/execute-withdraw.js";

export const executeWithdrawTool = defineTool({
  name: "solana_lend_execute_withdraw",
  group: "lend",
  tier: "execute",
  stability: "stable",
  action: "withdraw_lend",
  title: "Execute Kamino withdrawal",
  description:
    "Redeem fixed collateral units chosen from a target underlying base-unit amount at the " +
    "read-time rate. The target is NOT a guaranteed minimum or exact on-chain output: the " +
    "reserve can change before inclusion. Check the estimated output and encoded collateral " +
    "in simulation; read the wallet and position after execution. Simulates before sending " +
    "unless skipSimulation is true; failed simulations send nothing. Never retries ambiguous sends.",
  input: LendExecuteWithdrawInputSchema,
  run: (input) => executeWithdraw(input),
});
