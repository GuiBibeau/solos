// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isAutonomous, isTrusted, intakeIssueNumber } from "../trust.js";
import { codexReviewMarker } from "./codex-review-task.js";
import { CODEX_USER, deliverReview, REVIEW_SHA, reviewFixture } from "./review-webhook-fixture.js";

const previousBotName = process.env.FACTORY_BOT_NAME;
beforeAll(() => {
  process.env.FACTORY_BOT_NAME = "solos-factory";
});
afterAll(() => {
  if (previousBotName === undefined) delete process.env.FACTORY_BOT_NAME;
  else process.env.FACTORY_BOT_NAME = previousBotName;
});

describe("[integration] automatic Codex review webhooks", () => {
  test("signed inline findings reach the custom hook and form one restricted revision", async () => {
    const fixture = reviewFixture();
    const { response, deliveries } = await deliverReview(fixture);
    expect(response.status).toBe(200);
    expect(deliveries).toHaveLength(1);
    const delivery = deliveries[0];
    const auth = delivery?.options.auth;
    expect(isAutonomous(auth)).toBe(true);
    expect(isTrusted(auth)).toBe(false);
    expect(intakeIssueNumber(auth)).toBe(37);
    const context = delivery?.options.context?.join("\n") ?? "";
    expect(context).toContain("First finding");
    expect(context).toContain("Second finding");
    expect(context).toContain("never ask_question");
    expect(context).toContain("Leave shipping to the maintainer");
    expect(context).toContain(codexReviewMarker({ reviewId: 700, sha: REVIEW_SHA }));
  });

  test("only the earliest finding dispatches, even if later webhooks arrive first", async () => {
    const fixture = reviewFixture();
    const second = fixture.comments[0];
    if (!second) throw new Error("Missing fixture comment");
    const first = fixture.payload.comment;
    fixture.payload.comment = second;
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
    fixture.payload.comment = first;
    expect((await deliverReview(fixture)).deliveries).toHaveLength(1);
  });

  test("findings are paginated before choosing the leader", async () => {
    const fixture = reviewFixture();
    fixture.comments = Array.from({ length: 101 }, (_, index) => ({
      ...fixture.payload.comment,
      id: index + 100,
    }));
    const result = await deliverReview(fixture);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]?.options.context?.join("\n")).toContain('"id":200');
  });

  test("a recorded attempt suppresses webhook redelivery", async () => {
    const fixture = reviewFixture();
    fixture.history.push({
      user: { ...CODEX_USER, login: "solos-factory[bot]" },
      body: codexReviewMarker({ reviewId: 700, sha: REVIEW_SHA }),
    });
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
  });

  test("two earlier Codex revisions exhaust the automatic budget", async () => {
    const fixture = reviewFixture();
    fixture.history = [1, 2].map((reviewId) => ({
      user: { ...CODEX_USER, login: "solos-factory[bot]" },
      body: codexReviewMarker({ reviewId, sha: REVIEW_SHA }),
    }));
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
  });

  test("a marker copied by another author cannot suppress a revision", async () => {
    const fixture = reviewFixture();
    fixture.history.push({
      user: { id: 10, login: "outsider", type: "User" },
      body: codexReviewMarker({ reviewId: 700, sha: REVIEW_SHA }),
    });
    expect((await deliverReview(fixture)).deliveries).toHaveLength(1);
  });

  test("queues an older review for reconciliation against the current head", async () => {
    const fixture = reviewFixture();
    const reviewedSha = "b".repeat(40);
    fixture.pr.head.sha = "c".repeat(40);
    fixture.review.commit_id = reviewedSha;
    fixture.payload.comment.commit_id = reviewedSha;
    fixture.comments = fixture.comments.map((comment) => ({
      ...comment,
      commit_id: reviewedSha,
    }));
    const result = await deliverReview(fixture);
    expect(result.deliveries).toHaveLength(1);
    expect(result.deliveries[0]?.options.context?.join("\n")).toContain(reviewedSha);
  });

  test("invalid signatures are rejected before any API request", async () => {
    const fixture = reviewFixture();
    const result = await deliverReview(fixture, { validSignature: false });
    expect(result.response.status).toBe(401);
    expect(result.deliveries).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  });

  test("Eve's default handler still ignores bots after the patch", async () => {
    const fixture = reviewFixture();
    fixture.payload.comment.body = "@solos-factory please fix";
    expect((await deliverReview(fixture, { defaultHandler: true })).deliveries).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  });
});
