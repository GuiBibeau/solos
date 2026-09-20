// @ts-check
import { REMOTE_URL, REPO_DIR } from "./git-remote.js";

/** @param {string} value */
const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;

/**
 * Build the station session refresh command.
 * @param {{ repoDir?: string, remoteUrl?: string }} [options]
 */
export const sessionSyncCommand = ({ repoDir = REPO_DIR, remoteUrl = REMOTE_URL } = {}) =>
  `cd ${shellQuote(repoDir)} && default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's|^origin/||') && git fetch ${shellQuote(remoteUrl)} "$default_branch" && sync_script=$(mktemp) && trap 'rm -f "$sync_script"' EXIT && git show 'FETCH_HEAD:scripts/factory-session-sync.sh' > "$sync_script" && bash "$sync_script" ${shellQuote(remoteUrl)}`;
