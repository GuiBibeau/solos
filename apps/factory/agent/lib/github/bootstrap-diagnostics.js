// @ts-check
/**
 * Translates raw sandbox bootstrap failures (token minting, cloning) into actionable messages that
 * name `FACTORY_REPO` and the fix, with anything credential-shaped scrubbed first.
 */

/** Upper bound on how much command output is quoted into an error message. */
const MAX_DETAIL_LENGTH = 2000;

/** GitHub token literals, tokens embedded in remote URLs, and authorization header values. */
const CREDENTIAL_PATTERNS = [
  /\bgh[a-z]_\w{8,}\b/g,
  /\bgithub_pat_\w{8,}\b/g,
  /x-access-token:[^\s"'@]+/gi,
  /\b(?:authorization|proxy-authorization)\b\s*[:=][^\n\r]*/gi,
  /\bbasic\s+[\d+/=A-Za-z]{8,}/gi,
  /\bbearer\s+[\w.~+/=-]{8,}/gi,
];

/**
 * Defence in depth: the token never enters the sandbox, but nothing quoted into an error may
 * depend on that.
 * @param {string} text
 */
export const sanitizeCommandOutput = (text) =>
  CREDENTIAL_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replaceAll(pattern, "[redacted]"),
    text,
  );

/** @param {string} repo */
export const appAccessMessage = (repo) =>
  `Cannot access ${repo}. Install the selected GitHub connector's app with access to this repository, then redeploy.`;

/**
 * GitHub reports "not found" both for a missing repository and for a private one the app cannot
 * see, so this message covers both fixes.
 * @param {string} repo
 */
export const missingRepoMessage = (repo) =>
  `Cannot clone ${repo}: GitHub reports the repository as not found. FACTORY_REPO must reference an existing repository in owner/repo format, and for a private repository the selected GitHub connector's app must be installed with access to it. Fix FACTORY_REPO or the app installation, then redeploy.`;

const NOT_FOUND_EVIDENCE =
  /repository[^\n]{0,200}not found|not found[^\n]{0,200}repository|could not read from remote repository/i;

const AUTHORIZATION_EVIDENCE =
  /authentication failed|authorization|permission denied|forbidden|error:? 403|access denied|invalid[^\n]{0,40}credential/i;

/**
 * Classifies a failed clone from its sanitised output.
 * @param {string} repo
 * @param {string} detail
 */
export const describeCloneFailure = (repo, detail) => {
  const safe = sanitizeCommandOutput(detail).slice(0, MAX_DETAIL_LENGTH);
  if (NOT_FOUND_EVIDENCE.test(safe)) return missingRepoMessage(repo);
  if (AUTHORIZATION_EVIDENCE.test(safe)) return appAccessMessage(repo);
  return `Failed to clone ${repo} while building the factory sandbox template. ${safe.trim()}`;
};

/**
 * Message text for an unknown thrown value, sanitised.
 * @param {unknown} error
 */
export const safeErrorMessage = (error) =>
  sanitizeCommandOutput(error instanceof Error ? error.message : String(error));
