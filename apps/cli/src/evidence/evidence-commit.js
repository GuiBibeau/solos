// @ts-check
/**
 * The evidence check resolves the reviewed commit itself. `--sha HEAD` is `git rev-parse HEAD`.
 * A block is for that commit when its sha matches, is the literal marker `HEAD`, or names an
 * ancestor whose tree diff is docs-only. Any other sha fails. A missing block fails earlier.
 */
import { isDocsPath } from "./docs-path.js";
import { checkPrBody } from "./pr-body.js";
import { captureCommand } from "./run-steps.js";

/** @typedef {import("./pr-body.js").EvidenceCheck} EvidenceCheck */
/** @typedef {{ ok: true } | { ok: false; reason: string }} ShaVerdict */
/** @typedef {(evidenceSha: string, head: string) => Promise<ShaVerdict>} ShaRelation */

/**
 * @param {string} evidenceSha
 * @param {string} head
 * @returns {ShaVerdict}
 */
const mismatch = (evidenceSha, head) => ({
  ok: false,
  reason: `sha mismatch: evidence ${evidenceSha}, expected ${head}`,
});

/**
 * Paths from `git diff --name-status -M`. Renames and copies contribute both names.
 * @param {string} text
 * @returns {string[]}
 */
export const pathsFromNameStatus = (text) => {
  /** @type {string[]} */
  const paths = [];
  for (const line of text.split("\n")) {
    const parts = line.split("\t").filter((part) => part !== "");
    if (parts.length < 2) continue;
    paths.push(parts[1] ?? "");
    const status = parts[0] ?? "";
    if ((status.startsWith("R") || status.startsWith("C")) && parts[2] !== undefined) {
      paths.push(parts[2]);
    }
  }
  return paths.filter((path) => path !== "");
};

/** Git peel suffix so `rev-parse` returns a commit, not a tag or tree. */
const COMMIT_PEEL = "{commit}";

/**
 * @param {string} sha
 * @param {string | undefined} cwd
 * @returns {Promise<string | undefined>}
 */
const resolveCommit = async (sha, cwd) => {
  const result = await captureCommand(
    ["git", "rev-parse", "--verify", `${sha}^${COMMIT_PEEL}`],
    cwd,
  );
  if (result.code !== 0) return undefined;
  const resolved = result.stdout.trim();
  return resolved === "" ? undefined : resolved;
};

/**
 * `--sha HEAD` becomes the checkout's HEAD. Any other value is the reviewed commit as given.
 * @param {string} sha
 * @param {string} [cwd]
 * @returns {Promise<string | undefined>}
 */
export const resolveReviewedSha = async (sha, cwd) =>
  sha === "HEAD" ? resolveCommit("HEAD", cwd) : sha;

/**
 * @param {string} evidenceSha
 * @param {string} head
 * @param {string | undefined} cwd
 * @returns {Promise<string[] | undefined>}
 */
const diffPaths = async (evidenceSha, head, cwd) => {
  const result = await captureCommand(
    ["git", "diff", "--name-status", "-M", evidenceSha, head],
    cwd,
  );
  return result.code === 0 ? pathsFromNameStatus(result.stdout) : undefined;
};

/**
 * True when `evidenceSha` is `head` or an ancestor and every path in the tree diff is docs.
 * An empty diff changed no code, so it counts. A sha that does not resolve does not.
 * @param {string} evidenceSha
 * @param {string} head
 * @param {string} [cwd]
 * @returns {Promise<ShaVerdict>}
 */
export const diffIsDocsOnlyAncestor = async (evidenceSha, head, cwd) => {
  const evidenceCommit = await resolveCommit(evidenceSha, cwd);
  const headCommit = await resolveCommit(head, cwd);
  if (evidenceCommit === undefined || headCommit === undefined) return mismatch(evidenceSha, head);
  if (evidenceCommit === headCommit) return { ok: true };
  const ancestor = await captureCommand(
    ["git", "merge-base", "--is-ancestor", evidenceCommit, headCommit],
    cwd,
  );
  if (ancestor.code !== 0) return mismatch(evidenceSha, head);
  const paths = await diffPaths(evidenceCommit, headCommit, cwd);
  if (paths === undefined) {
    return { ok: false, reason: `sha mismatch: cannot diff ${evidenceSha} against ${head}` };
  }
  const foreign = paths.find((path) => !isDocsPath(path));
  if (foreign === undefined) return { ok: true };
  return {
    ok: false,
    reason: `sha mismatch: evidence ${evidenceSha} is an ancestor of ${head}, but ${foreign} changed since`,
  };
};

/**
 * @param {EvidenceCheck} result
 * @returns {string | undefined}
 */
const evidenceShaOf = (result) => {
  if (result.ok || result.evidence === undefined) return undefined;
  const sha = /** @type {{ sha?: unknown }} */ (result.evidence).sha;
  return typeof sha === "string" ? sha : undefined;
};

/**
 * Accept a matching sha or `HEAD` immediately. On a sha mismatch, accept only when `relation`
 * reports a docs-only ancestor. Other failures (missing block, dirty, steps) are unchanged.
 * @param {string} body
 * @param {string} head
 * @param {ShaRelation} [relation]
 * @returns {Promise<EvidenceCheck>}
 */
export const checkEvidence = async (body, head, relation = diffIsDocsOnlyAncestor) => {
  const first = checkPrBody(body, head);
  if (first.ok || !first.reason.startsWith("sha mismatch")) return first;
  const evidenceSha = evidenceShaOf(first);
  if (evidenceSha === undefined) return first;
  const verdict = await relation(evidenceSha, head);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, evidence: first.evidence };
  return checkPrBody(body, head, { ancestorDocsOnly: true });
};

/**
 * @param {string} body
 * @param {string} sha
 * @param {string} [cwd]
 * @returns {Promise<EvidenceCheck>}
 */
export const reviewEvidence = async (body, sha, cwd) => {
  const head = await resolveReviewedSha(sha, cwd);
  if (head === undefined) return { ok: false, reason: `cannot resolve reviewed sha ${sha}` };
  return checkEvidence(body, head, (evidenceSha, reviewed) =>
    diffIsDocsOnlyAncestor(evidenceSha, reviewed, cwd),
  );
};
