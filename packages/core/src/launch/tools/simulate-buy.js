// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { LaunchBuyInputSchema } from "../domain/types.js";
import { simulateBuy } from "../use-cases/simulate-buy.js";

export const simulateBuyTool = defineTool({
  name: "solana_launch_simulate_buy",
  group: "launch",
  tier: "simulate",
  stability: "beta",
  action: "swap",
  title: "Simulate a pump.fun buy",
  description:
    "Simulate buying a pump.fun coin with a bounded SOL budget without submitting anything. " +
    "amount is the maximum SOL the wallet may spend, in lamports, including Pump's trading " +
    "fees — it is never a token quantity, and the same maximum is encoded in the transaction, " +
    "so nothing more can ever be spent. Network fees and any account rent are reported " +
    "separately and sit outside that budget. The executor re-reads live curve state and " +
    "derives the minimum tokens the program must deliver from it and maxSlippageBps; that " +
    "minimum is enforced on chain, so a curve that moves reverts the buy instead of filling it " +
    "badly. A completed curve, a curve quoted in anything but SOL, a missing curve, an " +
    "unsupported mint extension or an underfunded wallet is reported without building or " +
    "sending, and the buy is never rerouted to PumpSwap or Jupiter. Nothing is ever signed for " +
    "submission, and a later execute re-plans and may differ. The curve-side exit is " +
    "solana_launch_simulate_sell / solana_launch_execute_sell, which stop working once the " +
    "curve completes. Use solana_launch_execute_buy to send.",
  input: LaunchBuyInputSchema,
  run: (input) => simulateBuy(input),
});
