// @ts-check
import { defineSchedule } from "eve/schedules";
import github from "../channels/github.js";
import { factoryRepo } from "../lib/constants.js";
import { resolveBotName } from "../lib/github/bot-name.js";
import { rebaseApi } from "../lib/github/rebase-api.js";
import { rebaseCandidates } from "../lib/github/rebase-sweep.js";
import { rebaseTask } from "../lib/github/rebase-task.js";
import { revisionOwnerReceipt } from "../lib/github/revision-owner.js";
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
      console.error(
        JSON.stringify({ event: "factory-rebase-scan", candidates: candidates.length }),
      );
      for (const pr of candidates) {
        const dispatch = to(github, {
          ...factoryRepo,
          pullRequestNumber: pr.pullNumber,
          repositoryId: pr.repositoryId,
        }).send(
          `${rebaseTask(pr)}\n\n${revisionOwnerReceipt({
            deliveryId: `rebase:${pr.head}:${pr.base}`,
            pullNumber: pr.pullNumber,
            source: `scheduled-rebase:${pr.head}:${pr.base}`,
          })}`,
          {
            auth: stampAutonomous(appAuth, pr.pullNumber),
          },
        );
        waitUntil(dispatch);
        // Eve settles waitUntil tasks without throwing. Await here so failed handoffs fail the cron.
        const session = await dispatch;
        console.error(
          JSON.stringify({
            event: "factory-rebase-dispatched",
            pullNumber: pr.pullNumber,
            sessionId: session.id,
          }),
        );
      }
    },
  });

export default rebaseSchedule();
