import { defineWorkflowTool } from "eve/tools";
import {
  bindAndDispatchStation,
  StationDispatchInput,
} from "../lib/checkpoints/station-dispatch.js";

export default defineWorkflowTool({
  description: "Start or continue the implementer with runtime-bound checkpoint ownership.",
  execution: "background",
  inputSchema: StationDispatchInput,
  async execute(input, ctx, task) {
    "use workflow";
    return bindAndDispatchStation({ input, station: "implementer" }, { ctx, task });
  },
});
