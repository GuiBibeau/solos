import { defineWorkflowTool } from "eve/tools";
import {
  bindAndDispatchStation,
  StationDispatchInput,
} from "../lib/checkpoints/station-dispatch.js";

export default defineWorkflowTool({
  description: "Start or continue the classifier with runtime-bound checkpoint ownership.",
  execution: "background",
  inputSchema: StationDispatchInput,
  async execute(input, ctx, task) {
    "use workflow";
    return bindAndDispatchStation({ input, station: "classifier" }, { ctx, task });
  },
});
