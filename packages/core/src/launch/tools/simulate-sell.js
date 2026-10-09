// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LaunchSellInputSchema } from "../domain/types.js";
import { simulateSell } from "../use-cases/simulate-sell.js";

export const simulateSellTool = defineTool({
  name: "solana_launch_simulate_sell",
  group: "launch",
  tier: "simulate",
  stability: "beta",
  action: "swap",
  title: "Simulate a pump.fun sell",
  description:
    "Simulate selling a pump.fun coin back to its bonding curve without submitting anything. " +
    "amount is the exact quantity of the coin to sell, in its base units — it is never a SOL " +
    "figure. The executor re-reads live curve state and derives the least SOL the program must " +
    "return from it and maxSlippageBps; that minimum is enforced on chain, so a curve that " +
    "moves reverts the sell instead of filling it badly. Network fees are reported separately. " +
    "A completed curve, a curve quoted in anything but SOL, a missing curve, an unsupported " +
    "mint extension, or a wallet holding less of the coin than the sell asks for is reported " +
    "without building or sending, and the sell is never rerouted to PumpSwap or Jupiter. " +
    "Nothing is ever signed for submission, and a later execute re-plans and may differ. Use " +
    "solana_launch_execute_sell to send.",
  input: LaunchSellInputSchema,
  run: (input) => simulateSell(input),
});
