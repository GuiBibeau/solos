// @ts-check
import { defineTool } from "../../shared/tools/define-tool.js";
import { updateStrategy } from "../use-cases/registry-live.js";
import { updateInput } from "./draft-input.js";

export const executeUpdateTool = defineTool({
  name: "solana_strategy_execute_update",
  group: "strategy",
  tier: "execute",
  stability: "beta",
  action: "strategy",
  title: "Change strategy state",
  description:
    "Pause, resume, or cancel a registered Strategy. Cancel is the done state. " +
    "A move the state table does not allow is refused and the stored state stays as it was.",
  input: updateInput,
  run: ({ id, state }) => updateStrategy(id, state),
});
