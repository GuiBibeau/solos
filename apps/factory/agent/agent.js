// @ts-check
/**
 * Root agent runtime configuration: the model and compaction for the solOS factory orchestrator.
 * The GLM pipeline intentionally has no authored cumulative output-token cap; Eve still applies
 * its default input budget, session lifetime, context window, and provider response limits. The
 * rest of the surface (channels, extension, tools, skills, subagents) is discovered from here.
 */
import { defineAgent } from "eve";
import { modelConfigFor } from "./lib/models.js";

export default defineAgent({
  compaction: { thresholdPercent: 0.75 },
  ...modelConfigFor("orchestrator"),
});
