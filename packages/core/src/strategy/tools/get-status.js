// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { getStrategyStatus } from "../use-cases/registry-live.js";
import { statusInput } from "./draft-input.js";

export const getStatusTool = defineTool({
  name: "solana_strategy_get_status",
  group: "strategy",
  tier: "read",
  stability: "beta",
  title: "Get strategy status",
  description:
    "Read one registered Strategy, including its kind, bounds, tick source, and lifecycle state. " +
    "Use after register to confirm what the Engine stored.",
  input: statusInput,
  run: ({ id }) => getStrategyStatus(id),
});
