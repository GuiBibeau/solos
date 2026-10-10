// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { engageKillSwitch } from "../use-cases/kill-switch.js";
import { engageKillInput } from "./kill-input.js";

export const executeEngageKillTool = defineTool({
  name: "solana_strategy_execute_engage_kill",
  group: "strategy",
  tier: "execute",
  stability: "beta",
  action: "strategy",
  title: "Engage the kill switch",
  description:
    "Pause new reserves for every Strategy, or for one Strategy. " +
    "Settle and release still finish. The pause stays until it is disengaged, including across a restart.",
  input: engageKillInput,
  run: ({ scope, reason }) => engageKillSwitch(scope, reason),
});
