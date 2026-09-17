// @ts-check
/**
 * Station 3: implementation. Executes the analyst's plan in its own checkout, verifies with the
 * repository's own lever (`bun run solos dev verify --scope unit --json`), commits on a feature
 * branch, and pushes it with `push-branch`, the station's only side effect, inert by construction.
 * The pull request is opened later by the orchestrator, after review.
 */
import { defineAgent } from "eve";
import { modelConfigFor } from "../../lib/models.js";

export default defineAgent({
  description:
    "Execute an approved implementation plan in a checkout of the solOS repository: write the code on a " +
    "factory/<type>-<slug> branch with conventional commits, add a changeset when packages/actions changes, run " +
    "`bun run solos dev verify --scope unit --json`, commit, and push the branch. Returns the branch name, the " +
    "verification JSON verbatim as evidence, per-file change summary, and deviations. Stops with pushed: false " +
    "when the plan needs a protected path. The caller passes the work item, classification, and full analysis in " +
    "the message, plus an artifact id when the analyst saved its detail; on a revision run it also passes the " +
    "existing branch and the reviewer's findings.",
  limits: { maxOutputTokensPerSession: 200_000 },
  ...modelConfigFor("implementer"),
  outputSchema: {
    additionalProperties: false,
    properties: {
      base: {
        description: "The branch the work is based on, normally the repository's default branch.",
        type: "string",
      },
      branch: {
        description: "The feature branch the work was committed and pushed to.",
        type: "string",
      },
      change_summary: {
        description: "What changed and why, per file.",
        items: {
          additionalProperties: false,
          properties: {
            change: { description: "What changed in this file and why.", type: "string" },
            path: { description: "The file path.", type: "string" },
          },
          required: ["path", "change"],
          type: "object",
        },
        type: "array",
      },
      deviations: {
        description: "Departures from the plan, each with its reason; empty when the plan held.",
        items: { type: "string" },
        type: "array",
      },
      evidence: {
        description:
          "The exact JSON printed by `bun run solos dev verify --scope unit --json` (full scope for rebase verification) on the final commit, pasted verbatim as a string. Empty string when the command could not run.",
        type: "string",
      },
      known_limitations: {
        description: "Anything the reviewer should scrutinize.",
        items: { type: "string" },
        type: "array",
      },
      pushed: {
        description:
          "Whether push-branch succeeded; when false, the reason is in known_limitations.",
        type: "boolean",
      },
      verification: {
        description: "Commands run and what they produced, exactly.",
        items: {
          additionalProperties: false,
          properties: {
            command: { description: "The command as run.", type: "string" },
            result: {
              description: "What it produced: pass/fail and the relevant output.",
              type: "string",
            },
          },
          required: ["command", "result"],
          type: "object",
        },
        type: "array",
      },
    },
    required: [
      "branch",
      "base",
      "pushed",
      "change_summary",
      "verification",
      "evidence",
      "deviations",
      "known_limitations",
    ],
    type: "object",
  },
});
