// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LendExecuteDepositInputSchema } from "../domain/types.js";
import { executeDeposit } from "../use-cases/execute-deposit.js";

export const executeDepositTool = defineTool({
  name: "solana_lend_execute_deposit",
  group: "lend",
  tier: "execute",
  stability: "stable",
  action: "lend",
  title: "Execute Kamino deposit",
  description:
    "Supply an exact underlying amount into the one configured Kamino lending market from " +
    "the configured signer wallet and wait for confirmation. Signs and submits a real " +
    "transaction that moves funds. amount is the exact deposit in base units of the mint's " +
    "underlying token; the transaction encodes exactly that amount and cannot spend more. " +
    "The executor re-validates the configured market and reserve against chain state and " +
    "targets the signer's plain (vanilla) supply obligation — initializing it and its user " +
    "metadata when absent (rent is the signer's), never touching borrowing, leverage or " +
    "elevation-group obligations, and refusing an obligation that already carries borrows. " +
    "Simulates the exact transaction first and sends nothing when simulation, validation, or " +
    "the blockhash lifetime fails; skipSimulation bypasses only the simulation, never " +
    "validation. Never re-sends or rebuilds after an ambiguous submission — the signature is " +
    "reported in the structured failure, and confirmation alone is not proof of the requested " +
    "economic fill. Use solana_lend_simulate_deposit to preview without sending. Live funded " +
    "deposits stay an operator QA step until the matching withdrawal twin exists and is " +
    "checked.",
  input: LendExecuteDepositInputSchema,
  run: (input) => executeDeposit(input),
});
