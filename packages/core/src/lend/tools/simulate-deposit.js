// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LendDepositInputSchema } from "../domain/types.js";
import { simulateDeposit } from "../use-cases/simulate-deposit.js";

export const simulateDepositTool = defineTool({
  name: "solana_lend_simulate_deposit",
  group: "lend",
  tier: "simulate",
  stability: "stable",
  action: "lend",
  title: "Simulate Kamino deposit",
  description:
    "Simulate supplying an exact underlying amount into the one configured Kamino lending " +
    "market without submitting anything. amount is the exact deposit in base units of the " +
    "mint's underlying token — the same exact amount is encoded in the transaction, so " +
    "nothing more can ever be spent. The executor re-validates the configured market and " +
    "reserve against chain state, targets the signer's plain (vanilla) supply obligation — " +
    "initializing it and its user metadata when absent, never touching borrowing, leverage " +
    "or elevation-group obligations — and simulates exactly the transaction it would send, " +
    "reporting compute units, program logs, the predicted collateral receipt at the read-time " +
    "reserve exchange rate, and the rent and transaction fee the operation would pay. A " +
    "missing or underfunded source token account, an unsupported mint extension, or any " +
    "validation failure is reported without building or sending. Nothing is ever signed for " +
    "submission, and a later execute re-plans and may differ. Use " +
    "solana_lend_execute_deposit to send.",
  input: LendDepositInputSchema,
  run: (input) => simulateDeposit(input),
});
