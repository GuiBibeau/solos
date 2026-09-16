// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { TransferSolInputSchema } from "../domain/types.js";
import { sendSol } from "../use-cases/send-sol.js";

export const sendSolTool = defineTool({
  name: "solana_transfer_send_sol",
  group: "transfer",
  tier: "execute",
  title: "Send SOL",
  description:
    "Send SOL from the configured signer wallet to a recipient address and wait for confirmation. " +
    "Signs and submits a real transaction that moves funds. Simulates first unless skipSimulation is true. " +
    "Use solana_transfer_simulate_sol to preview without sending.",
  input: TransferSolInputSchema,
  run: (input) => sendSol(input),
});
