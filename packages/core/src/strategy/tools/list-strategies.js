// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { listStrategies } from "../use-cases/registry-live.js";
import { listInput } from "./draft-input.js";

export const listStrategiesTool = defineTool({
  name: "solana_strategy_list_strategies",
  group: "strategy",
  tier: "read",
  stability: "beta",
  title: "List strategies",
  description:
    "List Strategies registered with the Engine, optionally filtered by lifecycle state and owner label. " +
    "Use to see what is active, paused, done, expired, or failed.",
  input: listInput,
  run: (input) => listStrategies(input),
});
