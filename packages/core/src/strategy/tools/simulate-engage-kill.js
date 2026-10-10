// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { previewEngageKill } from "../use-cases/kill-switch.js";
import { engageKillInput } from "./kill-input.js";

export const simulateEngageKillTool = defineTool({
  name: "solana_strategy_simulate_engage_kill",
  group: "strategy",
  tier: "simulate",
  stability: "beta",
  action: "strategy",
  title: "Preview engaging the kill switch",
  description:
    "Show whether the kill switch is already engaged for a scope, and the reason a real engage would store. " +
    "Nothing is written.",
  input: engageKillInput,
  run: ({ scope, reason }) => previewEngageKill(scope, reason),
});
