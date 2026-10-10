// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { simulateRegisterStrategy } from "../use-cases/registry-live.js";
import { registerInput } from "./draft-input.js";

export const simulateRegisterTool = defineTool({
  name: "solana_strategy_simulate_register",
  group: "strategy",
  tier: "simulate",
  stability: "beta",
  action: "strategy",
  title: "Preview a strategy",
  description:
    "Validate a Strategy and resolve the observation a first tick would read, then return the Actions that tick would emit. " +
    "Registers nothing and does not change the Engine registry.",
  input: registerInput,
  run: (input) => simulateRegisterStrategy(input),
});
