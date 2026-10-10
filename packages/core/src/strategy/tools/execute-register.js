// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { registerStrategy } from "../use-cases/registry-live.js";
import { registerInput } from "./draft-input.js";

export const executeRegisterTool = defineTool({
  name: "solana_strategy_execute_register",
  group: "strategy",
  tier: "execute",
  stability: "beta",
  action: "strategy",
  title: "Register a strategy",
  description:
    "Register a Strategy with the Engine. Returns its id and active state. " +
    "The Strategy survives Engine restarts. Nothing ticks until a later release.",
  input: registerInput,
  run: (input) => registerStrategy(input),
});
