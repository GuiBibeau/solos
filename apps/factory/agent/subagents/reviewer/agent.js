// @ts-check
/**
 * Station 4: independent review. Runs on a different model vendor than the implementer on
 * purpose. It fetches the pushed branch into its own checkout, re-runs the `check` scope of the
 * lever, compares the resulting sha with the implementer's Evidence, and judges the real diff
 * against the acceptance criteria; it never modifies code. Its cumulative output cap remains an
 * independent safety boundary because this station runs outside the GLM-backed production line.
 */
import { defineAgent } from "eve";
import { modelConfigFor } from "../../lib/models.js";

export default defineAgent({
  description:
    "Independently review a pushed factory branch against the original work item and its acceptance criteria: " +
    "fetch the branch, run `bun run solos dev verify --scope check --json` in an independent clone, compare its " +
    "sha with the implementer's Evidence (missing, mismatched, or dirty Evidence is request_changes before " +
    "reading the diff), then read the real diff and return approve, request_changes, or reject with specific " +
    "findings. Never modifies code. The caller passes the work item, the analysis with acceptance criteria, the " +
    "branch name, and the implementer's report including its evidence field, plus an artifact id when the " +
    "analyst saved its detail.",
  limits: { maxOutputTokensPerSession: 100_000 },
  ...modelConfigFor("reviewer"),
  outputSchema: {
    additionalProperties: false,
    properties: {
      blocking_findings: {
        description:
          "Problems that block shipping: each names where it is, what is wrong, and why it matters.",
        items: { type: "string" },
        type: "array",
      },
      criteria_results: {
        description: "One entry per acceptance criterion from the analysis, judged individually.",
        items: {
          additionalProperties: false,
          properties: {
            criterion: { description: "The acceptance criterion, verbatim.", type: "string" },
            evidence: {
              description: "What in the diff or verification output shows it passing or failing.",
              type: "string",
            },
            pass: { type: "boolean" },
          },
          required: ["criterion", "pass", "evidence"],
          type: "object",
        },
        type: "array",
      },
      evidence_check: {
        description:
          "The Evidence gate result: the implementer's sha, the reviewer's own sha, whether they match, whether the tree was clean, and whether the implementer's run passed.",
        type: "string",
      },
      suggestions: {
        description: "Advisory notes that do not block shipping.",
        items: { type: "string" },
        type: "array",
      },
      summary: { description: "One paragraph: the verdict and what drove it.", type: "string" },
      verdict: { enum: ["approve", "request_changes", "reject"], type: "string" },
    },
    required: [
      "verdict",
      "evidence_check",
      "criteria_results",
      "blocking_findings",
      "suggestions",
      "summary",
    ],
    type: "object",
  },
});
