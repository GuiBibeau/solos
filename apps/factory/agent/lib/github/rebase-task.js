// @ts-check
import { asRecord, stringField } from "./channel-gates.js";

/** @typedef {import("./rebase-api.js").RebaseCandidate} Candidate */
/** @param {Pick<Candidate, "head" | "base">} pr */
export const rebaseMarker = (pr) => `<!-- solos-factory:rebase:${pr.head}:${pr.base} -->`;

/** Only the app's own comments count as attempts, never copied markers from PR authors.
 * @param {unknown[]} comments @param {string} botName @param {string} marker
 */
export const rebaseAttempted = (comments, botName, marker) =>
  comments.some((entry) => {
    const user = asRecord(asRecord(entry)?.user);
    return (
      user?.type === "Bot" &&
      user.login === `${botName}[bot]` &&
      (stringField(entry, "body") ?? "").includes(marker)
    );
  });

/** @param {Candidate} pr */
export const rebaseTask = (pr) =>
  [
    `Factory PR #${pr.pullNumber} is behind main. This is an unattended rebase revision, not new feature work. Never ask_question, request approval, mark ready, merge, or open another PR.`,
    `First call rebase-pull-request with pullNumber=${pr.pullNumber}, expectedHead=${pr.head}, expectedBase=${pr.base}. The tool rechecks scope, records the attempt, and requests a head-guarded GitHub REBASE. If it returns skipped, stop silently. If blocked, report its reason on this PR and stop; never fall back to a merge, force push, or resolve conflicts speculatively.`,
    `Only after the tool confirms status=rebased: recover the original issue, acceptance criteria and PR context. Delegate a verification-only revision of branch ${pr.branch} to the implementer, passing the exact new SHA from the tool. Fetch that branch with expectedHead set to the new SHA, then use verify-station at full scope with the branch and the new SHA as both expectedHead and expectedRemoteHead. Do not manufacture commits or replay the old feature implementation. If tests fail because main changed, fix only the integration regression under the existing protected-path restrictions, then commit, verify and push normally.`,
    "Have the independent reviewer inspect the resulting diff against main, acceptance criteria and new Evidence. Before updating the PR body, fetch its head again and require it to equal the Evidence sha. Preserve the original body except the Evidence and verification notes. Publish the untouched Evidence JSON only if clean and ok=true. If the branch moved, stop and report that verification is stale; never publish stale Evidence.",
    "Use github__addIssueComment with this PR's issueNumber for progress, not addPullRequestComment. Finish with the verified SHA and outcome. A rebase changes commit IDs, so previous Evidence and reviews are not proof of the new head. Leave shipping to the maintainer.",
  ].join("\n\n");
