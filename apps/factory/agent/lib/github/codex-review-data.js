// @ts-check
import { asRecord, stringField } from "./channel-gates.js";

/** @typedef {import("eve/channels/github").GitHubInboundContext} Context */
const CODEX_ID = 199_175_422;

/** GitHub's immutable account ID prevents trusting an author by display name or body text.
 * @param {unknown} value
 */
export const isCodex = (value) => {
  const actor = asRecord(value);
  return (
    actor?.id === CODEX_ID && actor.login === "chatgpt-codex-connector[bot]" && actor.type === "Bot"
  );
};

/** Read every page or fail closed; never silently process a truncated review/history.
 * @param {Context} ctx @param {string} path
 * @returns {Promise<unknown[]>}
 */
export const readGitHubList = async (ctx, path) => {
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
export const reviewFindings = (comments, review) =>
  comments
    .map(asRecord)
    .filter(
      (entry) =>
        entry !== null &&
        isCodex(entry.user) &&
        entry.pull_request_review_id === review.reviewId &&
        entry.commit_id === review.sha &&
        !entry.in_reply_to_id &&
        typeof entry.id === "number" &&
        Boolean(stringField(entry, "body")),
    )
    .toSorted((a, b) => Number(a?.id) - Number(b?.id))
    .map((entry) => ({
      id: entry?.id,
      path: entry?.path,
      line: entry?.line,
      body: entry?.body,
      url: entry?.html_url,
    }));
