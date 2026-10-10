// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { killSwitchStatus } from "../use-cases/kill-switch.js";
import { killScopeInput } from "./kill-input.js";

export const getKillSwitchTool = defineTool({
  name: "solana_strategy_get_kill_switch",
  group: "strategy",
  tier: "read",
  stability: "beta",
  title: "Read the kill switch",
  description:
    "Read whether the kill switch is engaged for every Strategy, or for one Strategy, and the reason if it is. " +
    "An engaged switch blocks new reserves only.",
  input: killScopeInput,
  run: ({ scope }) => killSwitchStatus(scope),
});
