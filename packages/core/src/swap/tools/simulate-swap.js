// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { SwapQuoteRequestSchema } from "../domain/types.js";
import { simulateSwap } from "../use-cases/simulate-swap.js";

export const simulateSwapTool = defineTool({
  name: "solana_swap_simulate_swap",
  group: "swap",
  tier: "simulate",
  stability: "stable",
  action: "swap",
  title: "Simulate swap",
  description:
    "Simulate selling an amount of one mint for another on Jupiter without submitting anything. " +
    "The executor builds a fresh transaction for the configured signer and simulates exactly " +
    "that transaction, reporting compute units and program logs. Nothing is ever sent or signed " +
    "for submission, and a later execute builds its own fresh quote that may differ. Requires " +
    "JUPITER_API_KEY in the environment.",
  input: SwapQuoteRequestSchema,
  run: (input) => simulateSwap(input),
});
