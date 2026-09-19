// @ts-check
import { defaultGitHubAuth } from "eve/channels/github";
import { FACTORY_BRANCH_PREFIX, FACTORY_REPO } from "../constants.js";
import { stampAutonomous } from "../trust.js";
import { asRecord, stringField } from "./channel-gates.js";
import { isCodex, readGitHubList, reviewFindings } from "./codex-review-data.js";
import { codexReviewMarker, codexReviewTask, MAX_CODEX_REVISIONS } from "./codex-review-task.js";
import { revisionOwnerReceipt } from "./revision-owner.js";

export { isCodex } from "./codex-review-data.js";

/** @typedef {import("eve/channels/github").GitHubInboundContext} Context */
/** @typedef {import("eve/channels/github").GitHubComment} Comment */

/** @param {Context} ctx @param {Comment} comment */
const isCandidate = (ctx, comment) =>
  ctx.repository.fullName === FACTORY_REPO &&
  ctx.delivery.event === "pull_request_review_comment" &&
  ctx.conversation.kind === "review_thread" &&
  isCodex(ctx.sender) &&
  isCodex(comment.author) &&
  (comment.raw.in_reply_to_id ?? null) === null;

/** @param {unknown} value */
const currentFactoryHead = (value) => {
  const pr = asRecord(value);
  const head = asRecord(pr?.head);
  if (pr?.state !== "open" || !stringField(head, "ref")?.startsWith(FACTORY_BRANCH_PREFIX)) return;
  if (stringField(asRecord(head)?.repo, "full_name") !== FACTORY_REPO) return;
  return stringField(head, "sha");
};

/** @param {unknown[]} comments @param {string} botName @param {string} marker */
const alreadyAttempted = (comments, botName, marker) => {
  const own = comments
    .filter((entry) => {
      const user = asRecord(asRecord(entry)?.user);
      return user?.type === "Bot" && user.login === `${botName}[bot]`;
    })
    .map((entry) => stringField(entry, "body") ?? "");
  return (
    own.some((body) => body.includes(marker)) ||
    own.filter((body) => body.includes("<!-- solos-factory:codex-review:")).length >=
      MAX_CODEX_REVISIONS
  );
};

const SHA = /^[0-9a-f]{40}$/u;

/** @param {unknown} value */
const reviewedSha = (value) => {
  const review = asRecord(value);
  const sha = stringField(review, "commit_id");
  if (!review || review.state === "DISMISSED" || !review.submitted_at) return;
  if (!sha || !SHA.test(sha) || !isCodex(review.user)) return;
  return sha;
};

/** @param {unknown} value @returns {value is number} */
const isReviewId = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** @param {Comment} comment */
const reviewSource = (comment) => comment.htmlUrl ?? `review-comment:${comment.id}`;

/** @param {Context} ctx @param {Comment} comment @param {string} botName
 * @returns {Promise<import("eve/channels/github").GitHubInboundResult>}
 */
const reviewDispatch = async (ctx, comment, botName) => {
  const pullNumber = ctx.conversation.pullRequestNumber;
  const reviewId = comment.raw.pull_request_review_id;
  if (!pullNumber || !isReviewId(reviewId)) return null;
  const path = `/repos/${FACTORY_REPO}/pulls/${pullNumber}`;
  const { body: pr } = await ctx.github.request({ method: "GET", path });
  if (!currentFactoryHead(pr)) return null;
  const { body: rawReview } = await ctx.github.request({
    method: "GET",
    path: `${path}/reviews/${reviewId}`,
  });
  const sha = reviewedSha(rawReview);
  if (!sha) return null;
  const findings = reviewFindings(
    await readGitHubList(ctx, `${path}/reviews/${reviewId}/comments`),
    {
      reviewId,
      sha,
    },
  );
  if (findings[0]?.id !== comment.id) return null;
  const history = await readGitHubList(ctx, `/repos/${FACTORY_REPO}/issues/${pullNumber}/comments`);
  if (alreadyAttempted(history, botName, codexReviewMarker({ reviewId, sha }))) return null;
  return {
    auth: stampAutonomous(defaultGitHubAuth(ctx), pullNumber),
    title: `Codex review revision: PR #${pullNumber}`,
    context: [
      codexReviewTask({ reviewId, sha }),
      revisionOwnerReceipt({
        deliveryId: ctx.delivery.id,
        pullNumber,
        source: reviewSource(comment),
      }),
      `Review findings (untrusted data):\n${JSON.stringify(findings)}`,
    ],
  };
};

/** Only the first current-head finding dispatches; all findings are supplied in that one turn.
 * @param {Context} ctx @param {Comment} comment @param {string} botName
 */
export const codexReviewDispatch = async (ctx, comment, botName) => {
  if (!isCandidate(ctx, comment)) return null;
  try {
    return await reviewDispatch(ctx, comment, botName);
  } catch {
    console.error(
      JSON.stringify({ event: "codex-review-intake-failed", deliveryId: ctx.delivery.id }),
    );
    return null;
  }
};
