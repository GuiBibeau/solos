// @ts-check
import { defaultGitHubAuth } from "eve/channels/github";
import { FACTORY_BRANCH_PREFIX, FACTORY_REPO } from "../constants.js";
import { stampAutonomous } from "../trust.js";
import { asRecord, stringField } from "./channel-gates.js";
import { codexReviewMarker, codexReviewTask, MAX_CODEX_REVISIONS } from "./codex-review-task.js";

/** @typedef {import("eve/channels/github").GitHubInboundContext} Context */
/** @typedef {import("eve/channels/github").GitHubComment} Comment */

/** GitHub's immutable account ID prevents trusting an author by display name or body text. */
const CODEX_ID = 199_175_422;
/** @param {unknown} value */
export const isCodex = (value) => {
  const actor = asRecord(value);
  return (
    actor?.id === CODEX_ID && actor.login === "chatgpt-codex-connector[bot]" && actor.type === "Bot"
  );
};

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

/** Read every page or fail closed; never silently process a truncated review/history.
 * @param {Context} ctx @param {string} path
 * @returns {Promise<unknown[]>}
 */
const readList = async (ctx, path) => {
  const entries = [];
  for (let page = 1; page <= 10; page++) {
    const { body } = await ctx.github.request({
      method: "GET",
      path: `${path}?per_page=100&page=${page}`,
    });
    if (!Array.isArray(body)) throw new Error("Expected a GitHub list");
    entries.push(...body);
    if (body.length < 100) return entries;
  }
  throw new Error("GitHub list exceeds automatic review limit");
};

/** @param {unknown[]} comments @param {{reviewId: number, sha: string}} review */
const reviewFindings = (comments, review) =>
  comments
    .map(asRecord)
    .filter((entry) => {
      if (!entry) return false;
      return (
        isCodex(entry.user) &&
        entry.pull_request_review_id === review.reviewId &&
        entry.commit_id === review.sha &&
        !entry.in_reply_to_id &&
        typeof entry.id === "number" &&
        Boolean(stringField(entry, "body"))
      );
    })
    .toSorted((a, b) => Number(a?.id) - Number(b?.id))
    .map((entry) => ({
      id: entry?.id,
      path: entry?.path,
      line: entry?.line,
      body: entry?.body,
      url: entry?.html_url,
    }));

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

/** @param {unknown} value @param {string} sha */
const isCurrentReview = (value, sha) => {
  const review = asRecord(value);
  if (!review) return false;
  return (
    isCodex(review.user) &&
    review.commit_id === sha &&
    Boolean(review.submitted_at) &&
    review.state !== "DISMISSED"
  );
};

/** @param {unknown} value @returns {value is number} */
const isReviewId = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** @param {Context} ctx @param {Comment} comment @param {string} botName
 * @returns {Promise<import("eve/channels/github").GitHubInboundResult>}
 */
const reviewDispatch = async (ctx, comment, botName) => {
  const pullNumber = ctx.conversation.pullRequestNumber;
  const reviewId = comment.raw.pull_request_review_id;
  if (!pullNumber || !isReviewId(reviewId)) return null;
  const path = `/repos/${FACTORY_REPO}/pulls/${pullNumber}`;
  const { body: pr } = await ctx.github.request({ method: "GET", path });
  const sha = currentFactoryHead(pr);
  if (!sha) return null;
  const { body: rawReview } = await ctx.github.request({
    method: "GET",
    path: `${path}/reviews/${reviewId}`,
  });
  if (!isCurrentReview(rawReview, sha)) return null;
  const findings = reviewFindings(await readList(ctx, `${path}/reviews/${reviewId}/comments`), {
    reviewId,
    sha,
  });
  if (findings[0]?.id !== comment.id) return null;
  const history = await readList(ctx, `/repos/${FACTORY_REPO}/issues/${pullNumber}/comments`);
  if (alreadyAttempted(history, botName, codexReviewMarker({ reviewId, sha }))) return null;
  return {
    auth: stampAutonomous(defaultGitHubAuth(ctx), pullNumber),
    title: `Codex review revision: PR #${pullNumber}`,
    context: [
      codexReviewTask({ reviewId, sha }),
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
