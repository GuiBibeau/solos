// @ts-check
/**
 * Station 1: triage. Runs on a fast model because classification is a shaping step. The station
 * receives only text and returns the structured classification the pipeline routes on;
 * `needs_clarification` is the stop signal.
 */
import { defineAgent } from "eve";
import { modelConfigFor, sessionLimitsFor } from "../../lib/models.js";

export default defineAgent({
  description:
    "Classify an incoming solOS work item: type (bug/feature/refactor/question/chore/security), priority, " +
    "complexity, the slice or package involved, and whether it is actionable or needs clarification. Fast " +
    "triage only; no analysis or implementation. The caller passes the work item verbatim in the message.",
  limits: sessionLimitsFor("classifier"),
  ...modelConfigFor("classifier"),
  outputSchema: {
    additionalProperties: false,
    properties: {
      actionable: {
        description: "Whether the request contains enough information to act on.",
        type: "boolean",
      },
      affected_area: {
        description:
          "Best guess at the slice or package involved (e.g. 'core/transfer', 'solana', 'mcp', 'cli', 'harness', 'docs', 'unknown').",
        type: "string",
      },
      complexity: { enum: ["trivial", "small", "medium", "large"], type: "string" },
      needs_clarification: {
        description:
          "True when the request is ambiguous, contradictory, or missing essential details; the questions to ask go in `questions`.",
        type: "boolean",
      },
      priority: { enum: ["critical", "high", "medium", "low"], type: "string" },
      questions: {
        description:
          "The specific clarifying questions to ask; empty unless needs_clarification is true.",
        items: { type: "string" },
        type: "array",
      },
      summary: { description: "One-sentence restatement of the work item.", type: "string" },
      type: {
        enum: ["bug", "feature", "refactor", "question", "chore", "security"],
        type: "string",
      },
    },
    required: [
      "type",
      "priority",
      "complexity",
      "affected_area",
      "actionable",
      "needs_clarification",
      "questions",
      "summary",
    ],
    type: "object",
  },
});
