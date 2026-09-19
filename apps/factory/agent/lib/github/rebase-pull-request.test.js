// @ts-check
import { describe, expect, test } from "bun:test";
import { stampAutonomous, stampTrusted } from "../trust.js";
import {
  APP_AUTH,
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

describe("[integration] guarded factory rebase", () => {
  test("records an attempt, requests REBASE with expectedHeadOid and confirms ancestry", async () => {
    const fixture = rebaseFixture();
    expect(await run(fixture)).toMatchObject({ status: "rebased", sha: NEW_HEAD });
    const mutation = fixture.calls.find((call) => call.path === "/graphql");
    expect(mutation?.body).toMatchObject({
      variables: {
        input: {
          pullRequestId: "PR_test37",
          expectedHeadOid: OLD_HEAD,
          updateMethod: "REBASE",
        },
      },
    });
    expect(fixture.comments[0]?.body).toContain(marker);
    expect(
      fixture.calls.findIndex((call) => call.method === "POST" && call.path.endsWith("/comments")),
    ).toBeLessThan(fixture.calls.findIndex((call) => call.path === "/graphql"));
    expect(fixture.compareCount).toBe(2);
  });

  test("uses current main even when the PR reports an older base SHA", async () => {
    const fixture = rebaseFixture();
    fixture.pr.base.sha = "e".repeat(40);
    expect((await run(fixture)).status).toBe("rebased");
    const comparisons = fixture.calls.filter((call) => call.path.includes("/compare/"));
    expect(comparisons.every((call) => call.path.includes(`/compare/${MAIN_SHA}...`))).toBe(true);
    expect(fixture.comments[0]?.body).toContain(marker);
  });

  test("a concurrent push at mutation time cannot be overwritten", async () => {
    const fixture = rebaseFixture();
    fixture.race = true;
    expect((await run(fixture)).status).toBe("blocked");
    expect(fixture.pr.head.sha).toBe("d".repeat(40));
    expect(fixture.calls.filter((call) => call.path === "/graphql")).toHaveLength(1);
  });

  test("conflicts stop with a durable marker instead of recurring paid repair attempts", async () => {
    const fixture = rebaseFixture();
    fixture.conflict = true;
    expect((await run(fixture)).status).toBe("blocked");
    expect((await run(fixture)).status).toBe("skipped");
    expect(fixture.pr.head.sha).toBe(OLD_HEAD);
    expect(fixture.calls.filter((call) => call.path === "/graphql")).toHaveLength(1);
  });

  test.each([
    null,
    APP_AUTH,
    stampAutonomous(APP_AUTH, 99),
    stampTrusted(stampAutonomous(APP_AUTH, 99)),
  ])(
    "refuses unauthorized and differently scoped sessions without API traffic: %j",
    async (auth) => {
      const fixture = rebaseFixture();
      expect((await run(fixture, auth)).status).toBe("blocked");
      expect(fixture.calls).toHaveLength(0);
    },
  );

  test("a trusted maintainer can request the same scoped operation", async () => {
    expect((await run(rebaseFixture(), stampTrusted(APP_AUTH))).status).toBe("rebased");
  });

  test("another author's copied marker cannot block the app", async () => {
    const fixture = rebaseFixture();
    fixture.comments.push({ user: { type: "User", login: "outsider" }, body: marker });
    expect((await run(fixture)).status).toBe("rebased");
  });

  test("attempt history is paginated before mutation", async () => {
    const fixture = rebaseFixture();
    fixture.comments = Array.from({ length: 100 }, () => ({ user: BOT, body: "progress" }));
    fixture.comments.push({ user: BOT, body: marker });
    expect((await run(fixture)).status).toBe("skipped");
    expect(fixture.calls.filter((call) => call.path.endsWith("/comments"))).toHaveLength(2);
  });

  test("API failure fails closed without rewriting the branch", async () => {
    const fixture = rebaseFixture();
    fixture.failApi = true;
    await expect(run(fixture)).rejects.toThrow("HTTP 503");
    expect(fixture.pr.head.sha).toBe(OLD_HEAD);
  });
});
