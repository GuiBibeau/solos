// @ts-check
import { setTimeout } from "node:timers/promises";
import { intakeIssueNumber, isAutonomous, isTrusted } from "../trust.js";
import { asRecord } from "./channel-gates.js";
import { behindMain, REPO_PATH, readMainSha, rebaseCandidate, rebaseList } from "./rebase-api.js";
import { rebaseAttempted, rebaseMarker } from "./rebase-task.js";

/** @typedef {import("./rebase-api.js").RebaseApi} Api */
/** @typedef {import("./rebase-api.js").RebaseCandidate} Candidate */
/** @typedef {{pullNumber: number, expectedHead: string, expectedBase: string}} RebaseInput */
/** @typedef {{status: "skipped" | "blocked" | "rebased", reason: string, sha?: string}} RebaseResult */
const REBASE_MUTATION = `mutation($input: UpdatePullRequestBranchInput!) {
  updatePullRequestBranch(input: $input) { pullRequest { headRefOid } }
}`;

/** @param {Api} api @param {Candidate} pr */
const requestRebase = async (api, pr) => {
  const result = asRecord(
    await api("/graphql", {
      method: "POST",
      body: {
        query: REBASE_MUTATION,
        variables: {
          input: { pullRequestId: pr.id, expectedHeadOid: pr.head, updateMethod: "REBASE" },
        },
      },
    }),
  );
  if (!result?.data || result.errors) throw new Error("GitHub refused the guarded rebase");
};

/** GitHub may complete the update asynchronously. Never claim success from acceptance alone.
 * @param {Api} api @param {Candidate} before
 */
const confirmRebase = async (api, before) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await setTimeout(2000);
    const after = rebaseCandidate(
      await api(`${REPO_PATH}/pulls/${before.pullNumber}`),
      await readMainSha(api),
    );
    if (!after) throw new Error("Pull request left the permitted rebase scope");
    if (after.head !== before.head && !(await behindMain(api, after))) return after.head;
  }
  throw new Error("GitHub accepted the update but a current rebased head could not be confirmed");
};

/** @param {Api} api @param {Candidate} pr @returns {Promise<RebaseResult>} */
const performRebase = async (api, pr) => {
  // The marker is written before mutation: failed/uncertain attempts cannot loop on every tick.
  await api(`${REPO_PATH}/issues/${pr.pullNumber}/comments`, {
    method: "POST",
    body: {
      body: `${rebaseMarker(pr)}\nRebasing onto main. Verification and fresh Evidence follow; merging remains manual.`,
    },
  });
  try {
    await requestRebase(api, pr);
    const sha = await confirmRebase(api, pr);
    return {
      status: "rebased",
      reason: "Confirmed up to date with main; verify this new head.",
      sha,
    };
  } catch {
    return {
      status: "blocked",
      reason:
        "The guarded GitHub rebase failed or could not be confirmed. Inspect conflicts, concurrent pushes and branch rules before retrying manually. No fallback merge or force push was attempted; existing Evidence may be stale.",
    };
  }
};

/** @param {import("eve/context").SessionAuthContext | null} auth @param {number} pullNumber */
export const isRebaseAuthorized = (auth, pullNumber) =>
  isAutonomous(auth) ? intakeIssueNumber(auth) === pullNumber : isTrusted(auth);

/** Re-read all gates inside the queued turn, immediately before the expected-head mutation.
 * @param {RebaseInput} input
 * @param {{api: Api, botName: string, auth: import("eve/context").SessionAuthContext | null}} context
 * @returns {Promise<RebaseResult>}
 */
export const rebasePullRequest = async (input, context) => {
  const allowed = isRebaseAuthorized(context.auth, input.pullNumber);
  if (!allowed)
    return {
      status: "blocked",
      reason: "Rebases require trusted dispatch or this PR's autonomous scope.",
    };
  const pr = rebaseCandidate(
    await context.api(`${REPO_PATH}/pulls/${input.pullNumber}`),
    await readMainSha(context.api),
  );
  if (!pr)
    return { status: "skipped", reason: "Not an open same-repository factory PR targeting main." };
  if (
    pr.pullNumber !== input.pullNumber ||
    pr.head !== input.expectedHead ||
    pr.base !== input.expectedBase
  )
    return {
      status: "skipped",
      reason: "Head or main changed since dispatch; wait for a fresh scan.",
    };
  const comments = await rebaseList(context.api, `${REPO_PATH}/issues/${pr.pullNumber}/comments`);
  if (rebaseAttempted(comments, context.botName, rebaseMarker(pr)))
    return { status: "skipped", reason: "This head/main pair already had an automatic attempt." };
  if (!(await behindMain(context.api, pr)))
    return { status: "skipped", reason: "Already up to date with main." };
  return performRebase(context.api, pr);
};
