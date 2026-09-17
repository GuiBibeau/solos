// @ts-check
import { describe, expect, test } from "bun:test";
import { rebaseSchedule } from "../../schedules/rebase-pull-requests.js";
import { intakeIssueNumber, isAutonomous, isScheduleAppAuth, isTrusted } from "../trust.js";
import {
  APP_AUTH,
  BOT,
  MAIN_SHA,
  OLD_HEAD,
  rebaseFixture,
  withRebaseApi,
} from "./rebase-fixture.js";
import { rebaseCandidates } from "./rebase-sweep.js";
import { rebaseMarker } from "./rebase-task.js";

/** @param {ReturnType<typeof rebaseFixture>} fixture */
const scan = (fixture) => withRebaseApi(fixture, (api) => rebaseCandidates(api, "solos-factory"));

describe("[integration] scheduled factory rebases", () => {
  test("finds a behind factory PR and leaves GitHub unchanged until its queued turn", async () => {
    const fixture = rebaseFixture();
    expect(await scan(fixture)).toMatchObject([{ pullNumber: 37, head: OLD_HEAD, base: MAIN_SHA }]);
    expect(fixture.calls.every((call) => call.method === "GET")).toBe(true);
  });

  test("does not wake a model for current PRs or a recorded failed attempt", async () => {
    const fixture = rebaseFixture();
    fixture.behind = false;
    expect(await scan(fixture)).toEqual([]);
    fixture.behind = true;
    fixture.comments.push({ user: BOT, body: rebaseMarker({ head: OLD_HEAD, base: MAIN_SHA }) });
    expect(await scan(fixture)).toEqual([]);
  });

  test("scans every PR page without dispatching human or fork branches", async () => {
    const fixture = rebaseFixture();
    const human = { ...fixture.pr, head: { ...fixture.pr.head, ref: "codex/feature" } };
    const fork = { ...fixture.pr, head: { ...fixture.pr.head, repo: { full_name: "fork/solos" } } };
    fixture.pulls = [...Array.from({ length: 100 }, () => human), fork, fixture.pr];
    expect(await scan(fixture)).toHaveLength(1);
    expect(fixture.compareCount).toBe(1);
    expect(fixture.calls.filter((call) => call.path.endsWith("/pulls"))).toHaveLength(2);
  });

  test("discovery failures cannot dispatch partial work", async () => {
    const fixture = rebaseFixture();
    fixture.failApi = true;
    await expect(scan(fixture)).rejects.toThrow("HTTP 503");
  });

  test("the actual schedule sends a PR-scoped verification task at a 15-minute cadence", async () => {
    const fixture = rebaseFixture();
    await withRebaseApi(fixture, async (api) => {
      const schedule = rebaseSchedule({ api, botName: async () => "solos-factory" });
      expect(schedule.cron).toBe("*/15 * * * *");
      const deliveries =
        /** @type {{target: unknown, message: unknown, auth: import("eve/context").SessionAuthContext | null}[]} */ ([]);
      const pending = /** @type {Promise<unknown>[]} */ ([]);
      await schedule.run({
        appAuth: APP_AUTH,
        waitUntil: (promise) => {
          pending.push(promise);
        },
        to: (_channel, target) => ({
          send: async (message, options) => {
            deliveries.push({ target, message, auth: options.auth ?? null });
            return /** @type {import("eve/channels").Session} */ ({ id: "offline-session" });
          },
        }),
      });
      await Promise.all(pending);
      expect(deliveries).toHaveLength(1);
      const delivery = deliveries[0];
      expect(delivery?.target).toEqual({
        owner: "GuiBibeau",
        repo: "solos",
        pullRequestNumber: 37,
      });
      expect(isAutonomous(delivery?.auth ?? null)).toBe(true);
      expect(intakeIssueNumber(delivery?.auth ?? null)).toBe(37);
      expect(isTrusted(delivery?.auth ?? null)).toBe(false);
      expect(isScheduleAppAuth(delivery?.auth ?? null)).toBe(false);
      expect(delivery?.message).toContain("rebase-pull-request");
      expect(delivery?.message).toContain("--scope full --json");
      expect(delivery?.message).toContain("independent reviewer");
      expect(delivery?.message).toContain("require it to equal the Evidence sha");
      expect(delivery?.message).toContain("Leave shipping to the maintainer");
    });
  });
});
