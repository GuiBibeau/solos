// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { previewDisengageKill } from "../use-cases/kill-switch.js";
import { killScopeInput } from "./kill-input.js";

export const simulateDisengageKillTool = defineTool({
  name: "solana_strategy_simulate_disengage_kill",
  group: "strategy",
  tier: "simulate",
  stability: "beta",
  action: "strategy",
  title: "Preview disengaging the kill switch",
  description:
    "Show whether a kill switch scope is engaged, without lifting it. " +
    "Use this before disengage when a Caller needs to see the reason first.",
  input: killScopeInput,
  run: ({ scope }) => previewDisengageKill(scope),
});
