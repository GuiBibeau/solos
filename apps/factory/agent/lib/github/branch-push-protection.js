// @ts-check
import { REMOTE_URL, REPO_DIR } from "./git-remote.js";

/** @param {string} branch @param {string | undefined} expectedHead */
export const ancestryCommand = (branch, expectedHead) =>
  expectedHead === undefined
    ? undefined
    : `git -C ${REPO_DIR} merge-base --is-ancestor '${expectedHead}' 'refs/heads/${branch}'`;

/**
 * The lease makes the observed old value atomic with the update. The separate ancestry check
 * prevents using that lease to force a non-fast-forward rewrite.
 * @param {string} branch @param {string | undefined} expectedHead
 */
export const guardedPushCommand = (branch, expectedHead) => {
  const ref = `refs/heads/${branch}`;
  return (
    `git -C ${REPO_DIR} push --force-with-lease='${ref}:${expectedHead ?? ""}' ` +
    `${REMOTE_URL} '${ref}:${ref}'`
  );
};
