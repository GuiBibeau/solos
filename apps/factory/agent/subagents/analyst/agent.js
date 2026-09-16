// @ts-check
/**
 * Station 2: analysis and planning. Works from a live checkout of the repository (this station's
 * sandbox clones it at template build), so the plan names real files, the real slice, tool tier,
 * and constraining ADR. It plans; it never writes the implementation. The acceptance criteria it
 * produces are the contract the reviewer later judges the implementation against, verbatim.
 */
import { defineAgent } from "eve";
import { MODELS } from "../../lib/models.js";

export default defineAgent({
  description:
    "Analyze a classified solOS work item against the real repository checkout and produce an implementation " +
    "plan: problem statement, the slice and tool tier involved (with the simulate twin for execute tools), the " +
    "constraining ADR, approach, ordered steps, affected files, risks, acceptance criteria copied from the issue " +
    "form and only extended, and test strategy. Planning only; writes no code. The caller passes the work item, " +
    "its classification, and any research findings in the message, plus a research artifact id when the " +
    "researcher saved a full memo. May save its own deep supporting detail as an analysis artifact.",
  model: MODELS.analyst,
  outputSchema: {
    additionalProperties: false,
    properties: {
      acceptance_criteria: {
        description:
          "Objective, testable criteria the reviewer will check one by one, verbatim. Starts with the issue form's criteria unchanged; extensions follow.",
        items: { type: "string" },
        minItems: 1,
        type: "array",
      },
      adr: {
        description:
          "The ADR in docs/adr that constrains the change, cited by number and title, and the constraint it imposes.",
        type: "string",
      },
      affected_surface: {
        description:
          "Files, modules, or interfaces the change will touch; anything with a public contract called out.",
        items: { type: "string" },
        type: "array",
      },
      approach: {
        description:
          "The chosen solution strategy, and briefly the main alternative rejected and why.",
        type: "string",
      },
      artifact_id: {
        description:
          "Id of the saved analysis artifact holding the full supporting detail, or null when none was saved.",
        type: ["string", "null"],
      },
      assumptions: {
        description:
          "Assumptions the plan rests on, stated so the implementer and reviewer can see them.",
        items: { type: "string" },
        type: "array",
      },
      open_questions: {
        description:
          "External facts the plan could not resolve from the repository; surfaced instead of guessed.",
        items: { type: "string" },
        type: "array",
      },
      plan: {
        description:
          "Ordered, concrete steps; each independently verifiable. The smallest change that fully solves the problem.",
        items: { type: "string" },
        minItems: 1,
        type: "array",
      },
      problem_statement: {
        description: "What is actually wrong or wanted, restated as a precise engineering problem.",
        type: "string",
      },
      protected_paths_required: {
        description:
          "Protected paths the plan cannot avoid touching (packages/actions, docs/adr, .github, lint and type configs, LICENSE, CODEOWNERS); empty when none.",
        items: { type: "string" },
        type: "array",
      },
      risks: {
        description:
          "What could break, edge cases, compatibility concerns, and how the plan mitigates each.",
        items: { type: "string" },
        type: "array",
      },
      slice: {
        description:
          "The slice (wallet, transfer, swap, market, signals) or package the change lives in, and the layer within it.",
        type: "string",
      },
      test_strategy: {
        description:
          "What should be tested and how, grounded in the repository's Surfpool-based test setup and the solos lever.",
        type: "string",
      },
      tool_tier: {
        description:
          "For tool work: the tier (read, simulate, execute) and, for an execute tool, the name of its simulate twin. 'n/a' otherwise.",
        type: "string",
      },
    },
    required: [
      "problem_statement",
      "slice",
      "tool_tier",
      "adr",
      "approach",
      "plan",
      "affected_surface",
      "protected_paths_required",
      "risks",
      "acceptance_criteria",
      "test_strategy",
      "assumptions",
      "open_questions",
      "artifact_id",
    ],
    type: "object",
  },
});
