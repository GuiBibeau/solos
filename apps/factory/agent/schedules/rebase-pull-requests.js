// @ts-check
import { defineSchedule } from "eve/schedules";
import github from "../channels/github.js";
import { factoryRepo } from "../lib/constants.js";
import { resolveBotName } from "../lib/github/bot-name.js";
import { rebaseApi } from "../lib/github/rebase-api.js";
import { rebaseCandidates } from "../lib/github/rebase-sweep.js";
import { rebaseTask } from "../lib/github/rebase-task.js";
import { stampAutonomous } from "../lib/trust.js";

/** Injectable HTTP boundary for offline schedule integration tests.
 * @param {{api?: import("../lib/github/rebase-api.js").RebaseApi, botName?: () => Promise<string>}} [dependencies]
 */
export const rebaseSchedule = (dependencies = {}) =>
  defineSchedule({
    cron: "*/15 * * * *",
    async run({ to, waitUntil, appAuth }) {
      const candidates = await rebaseCandidates(
        dependencies.api ?? rebaseApi(),
        await (dependencies.botName ?? resolveBotName)(),
      );
      for (const pr of candidates) {
        waitUntil(
          to(github, { ...factoryRepo, pullRequestNumber: pr.pullNumber }).send(rebaseTask(pr), {
            auth: stampAutonomous(appAuth, pr.pullNumber),
          }),
        );
      }
    },
  });

export default rebaseSchedule();
