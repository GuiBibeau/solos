// @ts-check
import { behindMain, REPO_PATH, readMainSha, rebaseCandidate, rebaseList } from "./rebase-api.js";
import { rebaseAttempted, rebaseMarker } from "./rebase-task.js";

/** Deterministic scan: no LLM call for current, foreign, closed or already-attempted PRs.
 * @param {import("./rebase-api.js").RebaseApi} api @param {string} botName
 */
export const rebaseCandidates = async (api, botName) => {
  const candidates = [];
  const main = await readMainSha(api);
  const pulls = await rebaseList(api, `${REPO_PATH}/pulls?state=open&base=main`);
  for (const value of pulls) {
    const pr = rebaseCandidate(value, main);
    if (!pr || !(await behindMain(api, pr))) continue;
    const comments = await rebaseList(api, `${REPO_PATH}/issues/${pr.pullNumber}/comments`);
    if (!rebaseAttempted(comments, botName, rebaseMarker(pr))) candidates.push(pr);
  }
  console.error(
    JSON.stringify({
      event: "factory-rebase-candidates",
      main,
      scanned: pulls.length,
      pullNumbers: candidates.map((pr) => pr.pullNumber),
    }),
  );
  return candidates;
};
