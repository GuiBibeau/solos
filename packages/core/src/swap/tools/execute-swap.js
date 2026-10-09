// @ts-check
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import { SwapQuoteRequestSchema } from "../domain/types.js";
import { executeSwap } from "../use-cases/execute-swap.js";

/** Execute twin input: the swap intent plus the explicit simulation bypass, default false. */
export const ExecuteSwapInputSchema = SwapQuoteRequestSchema.extend({
  skipSimulation: z
    .boolean()
    .default(false)
    .describe(
      "Skip the pre-send simulation of the exact transaction. Defaults to false. Skipping also " +
        "removes the measured spend bound, which is taken from that simulation (ADR-0024); " +
        "validation still runs.",
    ),
});

export const executeSwapTool = defineTool({
  name: "solana_swap_execute_swap",
  group: "swap",
  tier: "execute",
  stability: "stable",
  action: "swap",
  title: "Execute swap",
  description:
    "Execute a swap: sell an amount of one mint for another on Jupiter from the configured " +
    "signer wallet and wait for confirmation. Signs and submits a real transaction that moves " +
    "funds. A fresh Jupiter build is fetched for this call — a quote from an earlier read or " +
    "simulate is never reused, so prices may differ between calls. Simulates the exact " +
    "transaction first and sends nothing when simulation, validation, or the blockhash lifetime " +
    "fails; skipSimulation bypasses the simulation and with it the measured spend bound. Use " +
    "solana_swap_simulate_swap to preview without sending. Requires JUPITER_API_KEY.",
  input: ExecuteSwapInputSchema,
  run: (input) => executeSwap(input),
});
