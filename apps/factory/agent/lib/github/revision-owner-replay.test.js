// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createGitHubChannel, githubConfig } from "../../channels/github.js";
import { rebaseSchedule } from "../../schedules/rebase-pull-requests.js";
import { APP_AUTH, rebaseFixture, withRebaseApi } from "./rebase-fixture.js";
import { deliverReview, reviewFixture } from "./review-webhook-fixture.js";
import { revisionQueueFixture, revisionQueueStore } from "./webhook-route-fixture.js";

const OWNER = "repo:123:pull:37";
const human = { id: 10, login: "maintainer", type: "User" };
const previousBotName = process.env.FACTORY_BOT_NAME;
beforeAll(() => {
  process.env.FACTORY_BOT_NAME = "solos-factory";
});
afterAll(() => {
  if (previousBotName === undefined) delete process.env.FACTORY_BOT_NAME;
  else process.env.FACTORY_BOT_NAME = previousBotName;
});

const laterReview = () => {
  const fixture = reviewFixture();
  fixture.review.id = 701;
  fixture.payload.comment.pull_request_review_id = 701;
  fixture.comments = fixture.comments.map((comment) => ({
    ...comment,
    id: comment.id + 100,
    pull_request_review_id: 701,
    body: `${comment.body} from the later review`,
  }));
  fixture.payload.comment = fixture.comments[1];
  return fixture;
};

const amendment = () => {
  const fixture = reviewFixture();
  fixture.payload.sender = human;
  fixture.payload.comment.user = human;
  fixture.payload.comment.author_association = "OWNER";
  fixture.payload.comment.body = "@solos-factory preserve this requirement";
  return fixture;
};

const failedCi = () => {
  const fixture = reviewFixture();
  /** @type {any} */ (fixture).payload = {
    action: "completed",
    repository: fixture.payload.repository,
    sender: human,
    installation: { id: 1 },
    check_suite: {
      id: 800,
      status: "completed",
      conclusion: "failure",
      head_branch: "factory/test",
      head_sha: fixture.pr.head.sha,
      pull_requests: [{ number: 37 }],
      app: { slug: "github-actions" },
    },
  };
  return fixture;
};

/** @param {ReturnType<typeof revisionQueueFixture>} queue */
const deliverRebase = async (queue) =>
  withRebaseApi(rebaseFixture(), async (api) => {
    const channel = createGitHubChannel({
      ...githubConfig,
      botName: "solos-factory",
      credentials: { webhookSecret: "offline", installationToken: "offline" },
    });
    const schedule = rebaseSchedule({ api, botName: async () => "solos-factory" });
    const pending = /** @type {Promise<unknown>[]} */ ([]);
    await schedule.run({
      appAuth: APP_AUTH,
      waitUntil: (promise) => {
        pending.push(promise);
      },
      to: (_definition, target) => ({
        send: async (message, options) => {
          if (!channel.receive) throw new Error("Missing GitHub receive hook");
          return channel.receive({ target, message, auth: options.auth }, { from: queue.from });
        },
      }),
    });
    await Promise.all(pending);
  });

describe("[integration] PR revision owner replay", () => {
  test("one durable writer retains reordered work, redeliveries and reconnects", async () => {
    const store = revisionQueueStore();
    const queue = revisionQueueFixture(store);
    const first = reviewFixture();
    const replay = { from: queue.from, deliveryId: "review-700" };
    const results = await Promise.all([
      deliverReview(laterReview(), { from: queue.from, deliveryId: "review-701" }),
      deliverReview(amendment(), {
        from: queue.from,
        deliveryId: "amendment-1",
        event: "issue_comment",
      }),
      deliverReview(failedCi(), {
        from: queue.from,
        deliveryId: "ci-800",
        event: "check_suite",
      }),
      deliverRebase(queue),
      deliverReview(first, replay),
      deliverReview(first, replay),
    ]);
    expect(results.slice(0, 3).map((result) => result.response.status)).toEqual([200, 200, 200]);
    const owner = queue.state(OWNER);
    expect(owner.writerStarts).toBe(1);
    expect(
      owner.items
        .keys()
        .toArray()
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual([
      "amendment-1",
      "ci-800",
      `rebase:${"a".repeat(40)}:${"b".repeat(40)}`,
      "review-700",
      "review-701",
    ]);
    const retained = owner.items
      .values()
      .map((item) => JSON.stringify(item.options.context ?? []))
      .toArray();
    expect(retained.some((item) => item.includes("First finding"))).toBe(true);
    expect(retained.some((item) => item.includes("later review"))).toBe(true);

    const restarted = revisionQueueFixture(store);
    await deliverReview(first, { ...replay, from: restarted.from });
    expect(restarted.state(OWNER)).toMatchObject({ writerStarts: 1 });
    expect(restarted.state(OWNER).items.size).toBe(5);

    await restarted.send("repo:123:pull:38", "other PR", {
      auth: null,
      context: ["delivery_id: other-pr"],
      state: /** @type {any} */ ({}),
    });
    expect(restarted.state("repo:123:pull:38")).toMatchObject({ writerStarts: 1 });
  });
});
