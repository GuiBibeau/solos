// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LaunchExecuteBuyInputSchema } from "../domain/types.js";
import { executeBuy } from "../use-cases/execute-buy.js";

export const executeBuyTool = defineTool({
  name: "solana_launch_execute_buy",
  group: "launch",
  tier: "execute",
  title: "Buy a pump.fun coin",
  description:
    "Buy a pump.fun coin with a bounded SOL budget and submit it. amount is the maximum SOL " +
    "the wallet may spend, in lamports, including Pump's trading fees — it is never a token " +
    "quantity, and the same maximum is encoded in the transaction, so nothing more can ever be " +
    "spent. Network fees and any account rent are reported separately and sit outside that " +
    "budget. The executor re-reads live curve state and derives the minimum tokens the program " +
    "must deliver from it and maxSlippageBps; that minimum is enforced on chain, so a curve " +
    "that moves between planning and landing reverts the buy instead of filling it badly. The " +
    "exact transaction that will be submitted is simulated first unless skipSimulation is " +
    "true, which bypasses only the simulation and never the validation or that minimum. A " +
    "completed curve, a curve quoted in anything but SOL, a missing curve, an unsupported mint " +
    "extension or an underfunded wallet sends nothing, and the buy is never rerouted to " +
    "PumpSwap or Jupiter. An ambiguous submission keeps its signature in a structured failure " +
    "and is never re-sent or rebuilt; confirmation is not proof of the requested fill. The " +
    "curve-side exit is solana_launch_execute_sell, which stops working once the curve " +
    "completes. Use solana_launch_simulate_buy to preview.",
  input: LaunchExecuteBuyInputSchema,
  run: (input) => executeBuy(input),
});
