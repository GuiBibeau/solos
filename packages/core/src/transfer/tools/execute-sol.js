// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { transferLamports } from "../domain/amount.js";
import { TransferSolInputSchema } from "../domain/types.js";
import { sendSol } from "../use-cases/send-sol.js";

export const executeSolTool = defineTool({
  name: "solana_transfer_execute_sol",
  group: "transfer",
  tier: "execute",
  title: "Send SOL",
  description:
    "Send SOL from the configured signer wallet to a recipient address and wait for confirmation. " +
    "Signs and submits a real transaction that moves funds. Simulates first unless skipSimulation is true. " +
    "Use solana_transfer_simulate_sol to preview without sending.",
  input: TransferSolInputSchema,
  // Pure guard: dispatchers run it before the runtime exists, so a bad amount never reaches
  // signer or RPC work (the Layer would otherwise be built before the use case could reject).
  check: (input) => {
    transferLamports(input.amountSol);
  },
  run: (input) => sendSol(input),
});
