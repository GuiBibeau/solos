// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { TransferSolInputSchema } from "../domain/types.js";
import { simulateSol } from "../use-cases/simulate-sol.js";

export const simulateSolTool = defineTool({
  name: "solana_transfer_simulate_sol",
  group: "transfer",
  tier: "simulate",
  title: "Simulate SOL transfer",
  description:
    "Simulate sending SOL from the configured signer wallet to a recipient without submitting anything. " +
    "Returns compute units and program logs. Use to preview or validate a transfer before solana_transfer_send_sol.",
  input: TransferSolInputSchema,
  run: (input) => simulateSol(input),
});
