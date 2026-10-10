// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { simulateUpdateStrategy } from "../use-cases/registry-live.js";
import { updateInput } from "./draft-input.js";

export const simulateUpdateTool = defineTool({
  name: "solana_strategy_simulate_update",
  group: "strategy",
  tier: "simulate",
  stability: "beta",
  action: "strategy",
  title: "Preview a strategy state change",
  description:
    "Check whether a Strategy can move to active, paused, or done, and return the refusal when it cannot. " +
    "Applies nothing, including when the Strategy is already done, expired, or failed.",
  input: updateInput,
  run: ({ id, state }) => simulateUpdateStrategy(id, state),
});
