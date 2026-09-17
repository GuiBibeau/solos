// @ts-check
/**
 * GitHub channel: the factory's intake and delivery surface.
 *
 * - Credentials are brokered by Vercel Connect; tokens are resolved per call and never exposed to
 *   the model. `botName` is passed as a resolver so it resolves inside request handling, where the
 *   deployment's OIDC token exists.
 * - `onComment` keeps the built-in mention and ignore rules, then dispatches only for OWNER,
 *   MEMBER, or COLLABORATOR commenters and stamps `trusted`, which is what lets the approval
 *   policies run reversible writes without a card. Codex review findings use a separate,
 *   PR-scoped autonomous gate; other bot comments never start a session.
 * - `onIssue` is the unattended intake: the `agent-ready` label, applied by someone with at least
 *   triage permission (verified against the API) and confirmed as the label this event added (from
 *   the issue timeline, so a later unrelated label never re-runs the pipeline), rewrites the
 *   session to the autonomous principal with the intake issue stamped in.
 * - `onCheckSuite` is the red-CI fix loop, scoped to pull requests whose head branch carries the
 *   factory prefix, so a person's red PR never triggers an uninvited fix.
 * - `onPullRequest` posts one orienting comment on PRs opened by people (bots skipped); it is
 *   deliberately not association-gated, and the session carries no trusted stamp.
 * - Human-in-the-loop prompts are the channel's own: a comment with a mention-based reply
 *   instruction, whose answers route back through the same `onComment` gate.
 */
import { defaultGitHubAuth, githubChannel } from "eve/channels/github";
import { FACTORY_BRANCH_PREFIX } from "../lib/constants.js";
import { mentionPattern, resolveBotName } from "../lib/github/bot-name.js";
import {
  checkSuiteHeadBranch,
  factoryLabelWasJustAdded,
  hasFactoryLabel,
  isIgnoredComment,
  isTrustedCommenter,
  isTrustedLabeler,
} from "../lib/github/channel-gates.js";
import { CI_FIX_TASK, FACTORY_INTAKE_TASK, PR_SUMMARY_TASK } from "../lib/github/channel-tasks.js";
import { codexReviewDispatch, isCodex } from "../lib/github/codex-review.js";
import { githubCredentials } from "../lib/github/credentials.js";
import { stampAutonomous, stampTrusted } from "../lib/trust.js";

/** Exported for offline tests through the real signed-webhook route. */
/** @type {import("eve/channels/github").GitHubChannelConfig} */
export const githubConfig = {
  // A redelivery on the same review thread must wait for the attempt marker to be written.
  turnPolicy: "queue",
  botName: resolveBotName,
  credentials: githubCredentials,
  onCheckSuite: (ctx, suite) => {
    const headBranch = checkSuiteHeadBranch(suite.raw);
    const [pullNumber] = suite.pullRequests;
    const isFactoryFailure =
      suite.action === "completed" &&
      suite.conclusion === "failure" &&
      pullNumber !== undefined &&
      headBranch !== undefined &&
      headBranch.startsWith(FACTORY_BRANCH_PREFIX);
    return isFactoryFailure && pullNumber !== undefined
      ? { auth: stampAutonomous(defaultGitHubAuth(ctx), pullNumber), context: [CI_FIX_TASK] }
      : null;
  },
  onComment: async (ctx, comment) => {
    // A resolution failure means the mention can't be matched; acknowledge without dispatching.
    const botName = await resolveBotName().catch(() => null);
    if (botName === null) return null;
    if (isCodex(comment.author)) return codexReviewDispatch(ctx, comment, botName);
    const mentioned =
      !isIgnoredComment(comment, botName) &&
      mentionPattern(botName).test(comment.body) &&
      isTrustedCommenter(comment);
    return mentioned ? { auth: stampTrusted(defaultGitHubAuth(ctx)) } : null;
  },
  onIssue: async (ctx, issue) => {
    if (issue.action !== "labeled" || !hasFactoryLabel(issue.raw) || ctx.sender.type === "Bot")
      return null;
    if (!(await isTrustedLabeler(ctx))) return null;
    if (!(await factoryLabelWasJustAdded(ctx, issue.issueNumber))) return null;
    return {
      auth: stampAutonomous(defaultGitHubAuth(ctx), issue.issueNumber),
      context: [FACTORY_INTAKE_TASK],
    };
  },
  onPullRequest: (ctx, pullRequest) =>
    pullRequest.action === "opened" && ctx.sender.type !== "Bot"
      ? { auth: defaultGitHubAuth(ctx), context: [PR_SUMMARY_TASK] }
      : null,
};

export default githubChannel(githubConfig);
