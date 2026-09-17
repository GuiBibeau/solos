// @ts-check
/**
 * Task text the GitHub channel injects into dispatched sessions. Each task frames an unattended
 * run (or the PR summary) in behaviour only; the orchestrator's instructions carry the pipeline.
 */
import { FACTORY_LABEL } from "../constants.js";

/** How many automated CI-fix attempts a factory pull request gets before a person takes over. */
export const MAX_CI_FIX_ATTEMPTS = 2;

/** Injected into an unattended intake session (an issue labelled with the factory label). */
export const FACTORY_INTAKE_TASK = [
  `This issue was handed to the factory with the "${FACTORY_LABEL}" label, and this run is unattended: nobody is watching to answer a question or approve an action, so never use ask_question and never attempt an action that needs approval.`,
  "Run the work item through the full pipeline. If the classifier needs clarification, post its questions as a comment on the issue and stop; someone will re-label the issue when they've answered.",
  "Keep the requester in the loop as you go: post a short comment on this issue when a station completes, except the last one. Comments on this issue are the one conversational write this run has; you cannot comment anywhere else.",
  "Deliver the finished work as a draft pull request whose body carries the Evidence section. The message you end the run with appears on this issue: link the pull request there, and let it stand in for the progress comment for this final step.",
].join("\n\n");

/**
 * Injected when a check suite fails on one of the factory's own pull requests. The attempt cap is
 * counted from earlier fix-attempt comments on the thread, because each dispatch is a fresh
 * session and the thread is the only durable record they share; the comment is posted before the
 * fix so a run that dies mid-fix still leaves its mark.
 */
export const CI_FIX_TASK = [
  "A CI check suite failed on one of the factory's own pull requests. This run is unattended: nobody is watching to answer a question or approve an action, so never use ask_question and never attempt an action that needs approval.",
  "Before anything else, read the pull request and its check runs fresh. If the checks are green by now, or the failure belongs to a commit that is no longer the branch head, stop without posting anything.",
  "If the only failing check is an Evidence SHA mismatch and the current PR timeline shows a rebase verification still in progress, stop: that revision owns the fresh Evidence. Do not launch another implementer just to regenerate the same proof. Report a stalled rebase to a maintainer instead of duplicating its work.",
  `Count your own earlier fix-attempt comments on this pull request. If there are already ${MAX_CI_FIX_ATTEMPTS}, do not attempt another fix. Post one comment saying the factory is pausing its automated CI fixes on this pull request to avoid looping, ${MAX_CI_FIX_ATTEMPTS} attempts have not turned the checks green, and further troubleshooting needs a person. Then stop.`,
  "Otherwise, first post a short comment that a CI fix attempt is starting and what looks broken (future runs count these comments to know when to stop). Diagnose with github__getCiFailureContext, then run the fix as a revision: send the implementer the pull request's context, its branch name, and your diagnosis, and have the reviewer judge the updated branch. Pushing the fix re-runs the checks; update the pull request's Evidence section with the implementer's new JSON, and do not open a new pull request.",
].join("\n\n");

/** Injected when someone else opens a pull request; the PR's diff is already in context. */
export const PR_SUMMARY_TASK = [
  "A pull request was just opened. Post one comment that helps reviewers get oriented.",
  "Open with a short paragraph saying what the PR does and why, grounded in its title, description, and diff. Never guess at intent the diff doesn't show.",
  "Then add a markdown table breaking down the changed files: the file path, the kind of change (added, modified, removed, renamed), and what changed in one short phrase. For a very large PR, list the files that carry the substance and roll the rest into a final count row.",
  "Note whether the body carries an Evidence section with a JSON block, without judging it. Close with one line pointing reviewers at where to start. This comment is a summary, not a review: don't approve, request changes, or ask the author for anything.",
].join("\n\n");
