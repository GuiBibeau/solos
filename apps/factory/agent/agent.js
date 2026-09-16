// @ts-check
/**
 * Root agent runtime configuration: the model and the session budget for the solOS factory
 * orchestrator. The rest of the surface (channels, extension, tools, skills, subagents) is
 * discovered from the filesystem under `agent/`. Eve counts completed child usage against the
 * root, so this is an aggregate pipeline cap; each station declares its own tighter session cap.
 */
import { defineAgent } from "eve";
import { modelConfigFor } from "./lib/models.js";

export default defineAgent({
  compaction: { thresholdPercent: 0.75 },
  limits: { maxOutputTokensPerSession: 2_000_000 },
  ...modelConfigFor("orchestrator"),
});
