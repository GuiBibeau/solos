// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { disengageKillSwitch } from "../use-cases/kill-switch.js";
import { killScopeInput } from "./kill-input.js";

export const executeDisengageKillTool = defineTool({
  name: "solana_strategy_execute_disengage_kill",
  group: "strategy",
  tier: "execute",
  stability: "beta",
  action: "strategy",
  title: "Disengage the kill switch",
  description:
    "Lift a kill switch for every Strategy, or for one Strategy, so new reserves are allowed again. " +
    "The other scope is left as it was.",
  input: killScopeInput,
  run: ({ scope }) => disengageKillSwitch(scope),
});
