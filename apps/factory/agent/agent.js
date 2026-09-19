// @ts-check
/**
 * Root agent runtime configuration: the model and compaction for the solOS factory orchestrator.
 * The GLM pipeline disables Eve's cumulative input-token budget and omits an output-token cap;
 * context, provider response, and session-lifetime limits still apply. Existing durable sessions
 * retain the limits they were created with and need their pending continuation approved once.
 */
import { defineAgent } from "eve";
import { modelConfigFor, sessionLimitsFor } from "./lib/models.js";

export default defineAgent({
  compaction: { thresholdPercent: 0.75 },
  limits: sessionLimitsFor("orchestrator"),
  ...modelConfigFor("orchestrator"),
});
