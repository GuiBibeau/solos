// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { FACTORY_REPO } from "../constants.js";
import { codexReviewTask } from "./codex-review-task.js";
import { deliverReview, reviewFixture } from "./review-webhook-fixture.js";
import { revisionOwnerAddress, revisionOwnerReceipt } from "./revision-owner.js";

const previousBotName = process.env.FACTORY_BOT_NAME;
beforeAll(() => {
  process.env.FACTORY_BOT_NAME = "solos-factory";
});
afterAll(() => {
  if (previousBotName === undefined) delete process.env.FACTORY_BOT_NAME;
  else process.env.FACTORY_BOT_NAME = previousBotName;
});

describe("PR revision owner", () => {
  test("review threads, timeline work, CI and rebases share one durable PR address", () => {
    const pr = "repo:123:pull:37";
    expect(revisionOwnerAddress(`${pr}:review-comment:100`)).toBe(pr);
    expect(revisionOwnerAddress(`${pr}:review-comment:101`)).toBe(pr);
    expect(revisionOwnerAddress(pr)).toBe(pr);
    expect(revisionOwnerAddress("repo:123:pull:38")).toBe("repo:123:pull:38");
  });

  test("does not coalesce issues, unrelated PRs, or malformed addresses", () => {
    expect(revisionOwnerAddress("repo:123:issue:37")).toBe("repo:123:issue:37");
    expect(revisionOwnerAddress("repo:123:pull:38:review-comment:100")).toBe("repo:123:pull:38");
    expect(revisionOwnerAddress("repo:x:pull:37:review-comment:100")).toBe(
      "repo:x:pull:37:review-comment:100",
    );
  });

  test("receipt preserves source and requires reconciliation before delegation", () => {
    const receipt = revisionOwnerReceipt({
      deliveryId: "delivery-1",
      pullNumber: 37,
      source: "https://github.com/GuiBibeau/solos/pull/37#discussion_r1",
    });
    expect(receipt).toContain('pull_request="37"');
    expect(receipt).toContain(`repository="${FACTORY_REPO}"`);
    expect(receipt).toContain("discussion_r1");
    expect(receipt).toContain("delivery_id: delivery-1");
    expect(receipt).toContain("only one branch-writing station");
    expect(receipt).toContain("expected remote head");
    expect(receipt).toContain("station task/session ID");
  });

  test("queued findings survive a newer head until current-head evidence addresses them", () => {
    const task = codexReviewTask({ reviewId: 700, sha: "a".repeat(40) });
    expect(task).toContain("do not discard its findings");
    expect(task).toContain("retain and repair every distinct finding");
    expect(task).toContain("clean newer review does not erase an unresolved finding");
    expect(task).toContain("current head");
  });

  test("signed review, maintainer amendment, and failed CI enter the same queued owner", async () => {
    const review = reviewFixture();
    const reviewDelivery = (await deliverReview(review)).deliveries[0];
    expect(reviewDelivery?.address).toBe("repo:123:pull:37");

    const amendment = reviewFixture();
    const human = { id: 10, login: "maintainer", type: "User" };
    amendment.payload.sender = human;
    amendment.payload.comment.user = human;
    amendment.payload.comment.author_association = "OWNER";
    amendment.payload.comment.body = "@solos-factory preserve this requirement";
    const amendmentResult = await deliverReview(amendment, { event: "issue_comment" });
    expect(amendmentResult.deliveries[0]?.address).toBe("repo:123:pull:37");

    const failure = reviewFixture();
    /** @type {any} */ (failure).payload = {
      action: "completed",
      repository: failure.payload.repository,
      sender: human,
      installation: { id: 1 },
      check_suite: {
        id: 800,
        action: "completed",
        status: "completed",
        conclusion: "failure",
        head_branch: "factory/test",
        head_sha: failure.pr.head.sha,
        pull_requests: [{ number: 37 }],
        app: { slug: "github-actions" },
      },
    };
    const ciResult = await deliverReview(failure, { event: "check_suite" });
    expect(ciResult.deliveries[0]?.address).toBe("repo:123:pull:37");
    const context = ciResult.deliveries[0]?.options.context?.join("\n") ?? "";
    expect(context).toContain("check-suite:800");
    expect(context).toContain("publish-revision-evidence with phase=reconcile");
    expect(context).toContain("repairAllowed is false");
  });
});
