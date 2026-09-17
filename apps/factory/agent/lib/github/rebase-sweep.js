// @ts-check
import { behindMain, REPO_PATH, rebaseCandidate, rebaseList } from "./rebase-api.js";
import { rebaseAttempted, rebaseMarker } from "./rebase-task.js";

/** Deterministic scan: no LLM call for current, foreign, closed or already-attempted PRs.
 * @param {import("./rebase-api.js").RebaseApi} api @param {string} botName
 */
export const rebaseCandidates = async (api, botName) => {
  const candidates = [];
  const pulls = await rebaseList(api, `${REPO_PATH}/pulls?state=open&base=main`);
  for (const value of pulls) {
    const pr = rebaseCandidate(value);
    if (!pr || !(await behindMain(api, pr))) continue;
    const comments = await rebaseList(api, `${REPO_PATH}/issues/${pr.pullNumber}/comments`);
    if (!rebaseAttempted(comments, botName, rebaseMarker(pr))) candidates.push(pr);
  }
  return candidates;
};
