// @ts-check
/**
 * The authorization gates the GitHub channel applies at dispatch. Trust is decided here, on the
 * signed webhook, and stamped into session auth; nothing downstream re-derives it.
 */
import { FACTORY_LABEL } from "../constants.js";

/** @typedef {import("eve/channels/github").GitHubComment} GitHubComment */
/** @typedef {import("eve/channels/github").GitHubInboundContext} GitHubInboundContext */

/**
 * GitHub's `author_association` values that mark a user the repo has trusted with write access.
 * Anything else (CONTRIBUTOR, FIRST_TIME_CONTRIBUTOR, NONE, MANNEQUIN) is acknowledged without a
 * session.
 */
const TRUSTED_ASSOCIATIONS = new Set(["COLLABORATOR", "MEMBER", "OWNER"]);

/**
 * Fine-grained role names from the collaborator-permission endpoint. Triage is the floor: the
 * permission normally required to apply a label by hand.
 */
const TRUSTED_LABELER_ROLES = new Set(["admin", "maintain", "write", "triage"]);

/**
 * A JSON value as a plain object, or null.
 * @param {unknown} value
 * @returns {Readonly<Record<string, unknown>> | null}
 */
export const asRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? /** @type {Readonly<Record<string, unknown>>} */ (value)
    : null;

/**
 * A string field of a JSON object, or undefined.
 * @param {unknown} value
 * @param {string} key
 */
export const stringField = (value, key) => {
  const field = asRecord(value)?.[key];
  return typeof field === "string" ? field : undefined;
};

/**
 * Replicates the channel's built-in ignore rules: eve's own marker comments, bot authors, and the
 * agent's own `<bot>[bot]` login.
 * @param {GitHubComment} comment
 * @param {string} botName
 */
export const isIgnoredComment = (comment, botName) => {
  if (comment.body.includes("<!-- eve:github:")) return true;
  const { author } = comment;
  if (author === undefined) return false;
  return author.type === "Bot" || author.login.toLowerCase() === `${botName.toLowerCase()}[bot]`;
};

/** @param {GitHubComment} comment */
export const isTrustedCommenter = (comment) => {
  const association = comment.raw.author_association;
  return typeof association === "string" && TRUSTED_ASSOCIATIONS.has(association);
};

/**
 * Whether the webhook sender holds at least triage permission on the repo. The issues webhook
 * carries the issue author's association, never the labeler's, and GitHub fires `labeled` even for
 * labels attached at creation (which issue forms let unauthenticated reporters do), so the
 * sender's permission is verified against the API. Fails closed on any error.
 * @param {GitHubInboundContext} ctx
 * @returns {Promise<boolean>}
 */
export const isTrustedLabeler = async (ctx) => {
  try {
    const { owner, name } = ctx.repository;
    const response = await ctx.github.request({
      method: "GET",
      path: `/repos/${owner}/${name}/collaborators/${encodeURIComponent(ctx.sender.login)}/permission`,
    });
    if (!response.ok) return false;
    const role =
      stringField(response.body, "role_name") ?? stringField(response.body, "permission");
    return role !== undefined && TRUSTED_LABELER_ROLES.has(role);
  } catch {
    return false;
  }
};

/**
 * Whether the issue's current `labels` array carries the factory label. eve exposes the issue
 * object as `issue.raw`, not the webhook payload with the just-added label, so this is only the
 * cheap pre-filter; {@link factoryLabelWasJustAdded} decides.
 * @param {Readonly<Record<string, unknown>>} issueRaw
 */
export const hasFactoryLabel = (issueRaw) => {
  const { labels } = issueRaw;
  return (
    Array.isArray(labels) && labels.some((entry) => stringField(entry, "name") === FACTORY_LABEL)
  );
};

/**
 * The head branch of a check-suite payload, whichever shape the webhook used.
 * @param {Readonly<Record<string, unknown>>} suiteRaw
 */
export const checkSuiteHeadBranch = (suiteRaw) =>
  stringField(suiteRaw, "head_branch") ?? stringField(suiteRaw.check_suite, "head_branch");

/**
 * Whether the label this `labeled` webhook reports is the factory label, decided from the issue's
 * event timeline: the most recent `labeled` event must name the factory label. Without this, any
 * later label added to an already-`agent-ready` issue would start the unattended pipeline again.
 * Fails closed on any error.
 * @param {GitHubInboundContext} ctx
 * @param {number} issueNumber
 * @returns {Promise<boolean>}
 */
export const factoryLabelWasJustAdded = async (ctx, issueNumber) => {
  try {
    const { owner, name } = ctx.repository;
    const response = await ctx.github.request({
      method: "GET",
      path: `/repos/${owner}/${name}/issues/${issueNumber}/events?per_page=100`,
    });
    if (!response.ok || !Array.isArray(response.body)) return false;
    const labeled = response.body.filter((event) => stringField(event, "event") === "labeled");
    const latest = labeled.at(-1);
    return latest !== undefined && stringField(asRecord(latest)?.label, "name") === FACTORY_LABEL;
  } catch {
    return false;
  }
};
