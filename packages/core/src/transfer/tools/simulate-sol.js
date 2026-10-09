// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { transferLamports } from "../domain/amount.js";
import { TransferSolInputSchema } from "../domain/types.js";
import { simulateSol } from "../use-cases/simulate-sol.js";

export const simulateSolTool = defineTool({
  name: "solana_transfer_simulate_sol",
  group: "transfer",
  tier: "simulate",
  stability: "stable",
  action: "transfer_sol",
  title: "Simulate SOL transfer",
  description:
    "Simulate sending SOL from the configured signer wallet to a recipient without submitting anything. " +
    "Returns compute units and program logs. Use to preview or validate a transfer before solana_transfer_execute_sol.",
  input: TransferSolInputSchema,
  // Pure guard: dispatchers run it before the runtime exists, so a bad amount never reaches
  // signer or RPC work (the Layer would otherwise be built before the use case could reject).
  check: (input) => {
    transferLamports(input.amountSol);
  },
  run: (input) => simulateSol(input),
});
