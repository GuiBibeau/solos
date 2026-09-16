// @ts-check
/**
 * Approval predicates double as the authorization policy for every GitHub write and for the
 * factory brain. Each returns `not-applicable` (run), `user-approval` (park for a person), or
 * `denied`. Unattended runs are denied rather than parked: nobody is watching an autonomous turn,
 * so a card would strand it, and a denial resolves server-side in one step.
 */
import { intakeIssueNumber, isAutonomous, isScheduleAppAuth, isTrusted } from "../trust.js";

/** @typedef {import("eve/tools/approval").ApprovalContext} ApprovalContext */
/** @typedef {import("eve/tools/approval").ApprovalStatus} ApprovalStatus */

/**
 * Baseline for reversible repository writes (comments, issue creation, assignees, reviewer
 * requests, stateless issue updates). Trusted callers and schedule turns run without a card;
 * everyone else, the dev TUI included, parks on one.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const writePolicy = (ctx) => {
  const auth = ctx.session.auth.current;
  if (isAutonomous(auth)) {
    return {
      reason:
        "Unattended factory runs may only apply labels, comment on their intake issue, and open draft pull requests.",
      type: "denied",
    };
  }
  return isTrusted(auth) || isScheduleAppAuth(auth) ? "not-applicable" : "user-approval";
};

/**
 * `addIssueComment`: an unattended run may narrate on the issue it was dispatched from, and
 * nowhere else. The intake number is stamped at dispatch on the signed webhook, never from model
 * input, so injected instructions can't make the run comment elsewhere.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const commentPolicy = (ctx) => {
  const auth = ctx.session.auth.current;
  if (!isAutonomous(auth)) return writePolicy(ctx);
  const intakeIssue = intakeIssueNumber(auth);
  if (intakeIssue !== null && ctx.toolInput?.issueNumber === intakeIssue) return "not-applicable";
  const scope = intakeIssue === null ? "" : ` (#${intakeIssue})`;
  return {
    reason: `Unattended factory runs may comment only on the issue they were dispatched from${scope}.`,
    type: "denied",
  };
};

/**
 * The shared factory brain becomes context for every later run, so an unattended run (whose
 * issue body is untrusted input) is denied writes; trusted callers write directly; every other
 * human parks on a card. Reads are never routed here.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const factoryBrainPolicy = (ctx) => {
  const auth = ctx.session.auth.current;
  if (isAutonomous(auth)) {
    return {
      reason: "Unattended factory runs may read the factory brain but not write to it.",
      type: "denied",
    };
  }
  return isTrusted(auth) || isScheduleAppAuth(auth) ? "not-applicable" : "user-approval";
};

/**
 * Label writes: the one reversible write an unattended run also needs, to mark the item picked up.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const labelPolicy = (ctx) =>
  isAutonomous(ctx.session.auth.current) ? "not-applicable" : writePolicy(ctx);

/**
 * Shipping (marking a pull request ready) parks for every human caller, trusted or not; unattended
 * runs are denied outright. This is the factory's human gate.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const shipPolicy = (ctx) =>
  isAutonomous(ctx.session.auth.current)
    ? {
        reason: "Unattended factory runs stop at a draft pull request; a person marks it ready.",
        type: "denied",
      }
    : "user-approval";

/**
 * Closing and reopening issues is routine, reversible triage, so it runs for every caller that can
 * reach it. Only trusted mentions, autonomous label runs, and the dev TUI ever get a session.
 * @returns {ApprovalStatus}
 */
export const closeIssuePolicy = () => "not-applicable";

/**
 * `createPullRequest`: a draft cannot merge, so it runs for every caller; anything mergeable
 * follows {@link shipPolicy}.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const createPullRequestPolicy = (ctx) =>
  ctx.toolInput?.draft === true ? "not-applicable" : shipPolicy(ctx);

/**
 * `updateIssue`: setting `state` closes or reopens, so it follows {@link closeIssuePolicy};
 * stateless edits follow {@link writePolicy}.
 * @param {ApprovalContext} ctx
 * @returns {ApprovalStatus}
 */
export const updateIssuePolicy = (ctx) =>
  ctx.toolInput?.state === undefined ? writePolicy(ctx) : closeIssuePolicy();
