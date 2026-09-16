// @ts-check
/**
 * GitHub tool surface for the orchestrator, mounted as an eve extension. Tools appear to the
 * model as `github__<name>`; credentials are brokered by Vercel Connect; `context` fills
 * `owner`/`repo` from `FACTORY_REPO`.
 *
 * `include` is the allowlist; there is no preset. Reads, triage writes, and PR authoring are in;
 * merge tools are deliberately absent (a person merges in the GitHub UI), and so are repository
 * administration, gists, releases, and CI mutation. `requireApproval` doubles as the authorization
 * policy (`agent/lib/github/approval.js`).
 */
import githubExtension from "@github-tools/eve-extension";
import { factoryRepo } from "../lib/constants.js";
import {
  closeIssuePolicy,
  commentPolicy,
  createPullRequestPolicy,
  labelPolicy,
  shipPolicy,
  updateIssuePolicy,
  writePolicy,
} from "../lib/github/approval.js";
import { GITHUB_CONNECTOR } from "../lib/github/credentials.js";

export default githubExtension({
  connector: GITHUB_CONNECTOR,
  context: factoryRepo,
  include: [
    "getRepository",
    "getRepositoryTree",
    "getFileContent",
    "searchCode",
    "listBranches",
    "listCommits",
    "getCommit",
    "compareCommits",
    "searchIssues",
    "listIssues",
    "getIssueContext",
    "listIssueComments",
    "createIssue",
    "updateIssue",
    "closeIssue",
    "addIssueComment",
    "listLabels",
    "addLabels",
    "removeLabel",
    "addAssignees",
    "removeAssignees",
    "listPullRequests",
    "getPullRequestContext",
    "listPullRequestFiles",
    "listPullRequestReviews",
    "createPullRequest",
    "updatePullRequest",
    "addPullRequestComment",
    "requestReviewers",
    "listCheckRuns",
    "getCiFailureContext",
  ],
  requireApproval: {
    addAssignees: writePolicy,
    addIssueComment: commentPolicy,
    addLabels: labelPolicy,
    addPullRequestComment: writePolicy,
    closeIssue: closeIssuePolicy,
    createIssue: writePolicy,
    createPullRequest: createPullRequestPolicy,
    removeAssignees: writePolicy,
    removeLabel: labelPolicy,
    requestReviewers: writePolicy,
    updateIssue: updateIssuePolicy,
    updatePullRequest: shipPolicy,
  },
});
