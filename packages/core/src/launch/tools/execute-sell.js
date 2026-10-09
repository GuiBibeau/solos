// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LaunchExecuteSellInputSchema } from "../domain/types.js";
import { executeSell } from "../use-cases/execute-sell.js";

export const executeSellTool = defineTool({
  name: "solana_launch_execute_sell",
  group: "launch",
  tier: "execute",
  stability: "beta",
  action: "swap",
  title: "Sell a pump.fun coin",
  description:
    "Sell a pump.fun coin back to its bonding curve and submit it. amount is the exact " +
    "quantity of the coin to sell, in its base units — it is never a SOL figure. The executor " +
    "re-reads live curve state and derives the least SOL the program must return from it and " +
    "maxSlippageBps; that minimum is enforced on chain, so a curve that moves between planning " +
    "and landing reverts the sell instead of filling it badly. Network fees are reported " +
    "separately. The exact transaction that will be submitted is simulated first unless " +
    "skipSimulation is true, which bypasses only the simulation and never the validation or " +
    "that minimum. A completed curve, a curve quoted in anything but SOL, a missing curve, an " +
    "unsupported mint extension, or a wallet holding less of the coin than the sell asks for " +
    "sends nothing, and the sell is never rerouted to PumpSwap or Jupiter. An ambiguous " +
    "submission keeps its signature in a structured failure and is never re-sent or rebuilt; " +
    "confirmation is not proof of the requested fill. This is the curve-side exit for a coin " +
    "bought with solana_launch_execute_buy. Use solana_launch_simulate_sell to preview.",
  input: LaunchExecuteSellInputSchema,
  run: (input) => executeSell(input),
});
