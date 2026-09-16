// @ts-check
/**
 * Root agent runtime configuration: the model and the session budget for the solOS factory
 * orchestrator. The rest of the surface (channels, extension, tools, skills, subagents) is
 * discovered from the filesystem under `agent/`. The output-token limit caps runaway sessions
 * while leaving room for the pipeline: the four stations draw from the root session's quota.
 */
import { defineAgent } from "eve";
import { modelConfigFor } from "./lib/models.js";

export default defineAgent({
  compaction: { thresholdPercent: 0.75 },
  limits: { maxOutputTokensPerSession: 200_000 },
  ...modelConfigFor("orchestrator"),
});
