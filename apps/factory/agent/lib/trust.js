// @ts-check
/**
 * The single trust authority. Channels stamp trust at dispatch, on the signed webhook; approval
 * policies read the stamps. Nothing downstream re-derives trust from model-readable content, and
 * a new capability never invents its own caller check.
 */

/** @typedef {import("eve/context").SessionAuthContext} SessionAuthContext */

/**
 * Constructed principal for unattended factory runs (an issue labelled `agent-ready`). Real
 * GitHub actors project as numeric `github:<id>` principals, so this fixed login can never
 * collide with one. The approval policies deny it everything except labels, progress comments on
 * its own intake issue, closing or reopening issues, and draft pull requests.
 */
export const AUTONOMOUS_PRINCIPAL = "github:solos-factory";

/** Auth attribute marking a caller the dispatching channel decided to trust. */
export const TRUSTED_ATTRIBUTE = "trusted";

/** Auth attribute carrying the issue number an unattended run was dispatched from. */
export const INTAKE_ISSUE_ATTRIBUTE = "intakeIssue";

/**
 * A copy of `auth` carrying the {@link TRUSTED_ATTRIBUTE} stamp. Channels call this next to the
 * authorization decision itself, so the stamp and the gate never drift apart.
 * @param {SessionAuthContext} auth
 * @returns {SessionAuthContext}
 */
export const stampTrusted = (auth) => ({
  ...auth,
  attributes: { ...auth.attributes, [TRUSTED_ATTRIBUTE]: "true" },
});

/**
 * Rewrites a channel auth into the unattended factory principal, carrying the intake issue
 * number. The webhook sender's identity is replaced (the turn must never run as the labeler).
 * @param {SessionAuthContext} auth
 * @param {number} intakeIssue
 * @returns {SessionAuthContext}
 */
export const stampAutonomous = (auth, intakeIssue) => ({
  ...auth,
  attributes: { ...auth.attributes, [INTAKE_ISSUE_ATTRIBUTE]: String(intakeIssue) },
  principalId: AUTONOMOUS_PRINCIPAL,
  principalType: "service",
});

/**
 * Whether the session runs unattended under {@link AUTONOMOUS_PRINCIPAL}.
 * @param {SessionAuthContext | null} auth
 */
export const isAutonomous = (auth) => auth !== null && auth.principalId === AUTONOMOUS_PRINCIPAL;

/**
 * The issue number an unattended run was dispatched from, or null when the session is not an
 * unattended run.
 * @param {SessionAuthContext | null} auth
 * @returns {number | null}
 */
export const intakeIssueNumber = (auth) => {
  if (auth === null || !isAutonomous(auth)) return null;
  const stamped = auth.attributes[INTAKE_ISSUE_ATTRIBUTE];
  if (typeof stamped !== "string" || stamped === "") return null;
  const issue = Number(stamped);
  return Number.isSafeInteger(issue) && issue > 0 ? issue : null;
};

/**
 * Whether the dispatching channel stamped this caller as trusted. This is the single caller
 * check for routine repository writes.
 * @param {SessionAuthContext | null} auth
 */
export const isTrusted = (auth) => auth !== null && auth.attributes[TRUSTED_ATTRIBUTE] === "true";

/**
 * The app principal eve supplies to schedules. The rebase sweep replaces it with a PR-scoped
 * autonomous stamp before sending work, so it does not inherit broad runtime write authority.
 * @param {SessionAuthContext | null} auth
 */
export const isScheduleAppAuth = (auth) =>
  auth !== null &&
  auth.authenticator === "app" &&
  auth.principalId === "eve:app" &&
  auth.principalType === "runtime";
