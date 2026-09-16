// @ts-check
import { defineEval } from "eve/evals";
import { calledInOrder, STATIONS } from "../helpers.js";

export default defineEval({
  description:
    "A small real work item runs the whole line: all four stations fire in order and the final report names the draft pull request with its Evidence section. Opt-in: this pushes a real branch to FACTORY_REPO, so run it deliberately against a scratch repository (bun run eval pipeline/full-pipeline).",
  tags: ["slow", "needs-connect", "pipeline"],
  async test(t) {
    await t.send(
      "Work item: add a short 'Reporting bugs' section to README.md that asks reporters to include the solos CLI version and the Surfpool reproduction steps. Acceptance criteria: README.md gains a 'Reporting bugs' heading; the section names `solos --version`; no other file changes. Run the full pipeline and deliver the result.",
    );
    t.succeeded();
    for (const station of STATIONS) t.calledSubagent(station);
    t.eventsSatisfy("stations ran in pipeline order", (events) => calledInOrder(events, STATIONS));
    t.judge.autoevals
      .closedQA(
        "Does the submission report completed work and point at a concrete deliverable, naming a draft pull request (a link or an identifier) with a review verdict and an Evidence section?",
      )
      .atLeast(0.5);
  },
  timeoutMs: 1_800_000,
});
