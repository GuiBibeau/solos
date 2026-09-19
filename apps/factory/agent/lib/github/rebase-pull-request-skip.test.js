// @ts-check
import { describe, expect, test } from "bun:test";
import {
  BOT,
  MAIN_SHA,
  NEW_HEAD,
  OLD_HEAD,
  REBASE_AUTH,
  REBASE_INPUT,
  rebaseFixture,
  withRebaseApi,
} from "./rebase-fixture.js";
import { rebasePullRequest } from "./rebase-pull-request.js";
import { rebaseMarker } from "./rebase-task.js";

/** @param {ReturnType<typeof rebaseFixture>} fixture
 * @param {import("eve/context").SessionAuthContext | null} [auth]
 */
const run = (fixture, auth = REBASE_AUTH) =>
  withRebaseApi(fixture, (api) =>
    rebasePullRequest(REBASE_INPUT, { api, botName: "solos-factory", auth }),
  );
const marker = rebaseMarker({ head: OLD_HEAD, base: MAIN_SHA });

describe("[integration] guarded factory rebase skip eligibility", () => {
  /** @type {[string, (fixture: ReturnType<typeof rebaseFixture>) => void][]} */
  const skipped = [
    [
      "closed PR",
      (f) => {
        f.pr.state = "closed";
      },
    ],
    [
      "human branch",
      (f) => {
        f.pr.head.ref = "codex/human-work";
      },
    ],
    [
      "fork",
      (f) => {
        f.pr.head.repo.full_name = "outsider/solos";
      },
    ],
    [
      "different base repo",
      (f) => {
        f.pr.base.repo.full_name = "outsider/solos";
      },
    ],
    [
      "different base branch",
      (f) => {
        f.pr.base.ref = "release";
      },
    ],
    [
      "new head",
      (f) => {
        f.pr.head.sha = NEW_HEAD;
      },
    ],
    [
      "new main",
      (f) => {
        f.main = NEW_HEAD;
      },
    ],
    [
      "current PR",
      (f) => {
        f.behind = false;
      },
    ],
    [
      "earlier attempt",
      (f) => {
        f.comments.push({ user: BOT, body: marker });
      },
    ],
  ];
  test.each(skipped)("does not mutate %s", async (_name, change) => {
    const fixture = rebaseFixture();
    change(fixture);
    expect((await run(fixture)).status).toBe("skipped");
    expect(fixture.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
  });
});
