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

  /** @type {[string, (fixture: ReturnType<typeof reviewFixture>) => void][]} */
  const ignored = [
    [
      "a different bot",
      (f) => {
        f.payload.comment = {
          ...f.payload.comment,
          user: { ...CODEX_USER, id: 12, login: "another[bot]" },
        };
      },
    ],
    [
      "a human spoofing Codex's name",
      (f) => {
        f.payload.comment = { ...f.payload.comment, user: { ...CODEX_USER, id: 12, type: "User" } };
      },
    ],
    [
      "a different webhook sender",
      (f) => {
        f.payload.sender = { ...CODEX_USER, id: 12 };
      },
    ],
    [
      "a stale reviewed head",
      (f) => {
        f.review.commit_id = "b".repeat(40);
      },
    ],
    [
      "a stale comment",
      (f) => {
        f.comments = f.comments.map((c) => ({ ...c, commit_id: "b".repeat(40) }));
      },
    ],
    [
      "a closed PR",
      (f) => {
        f.pr.state = "closed";
      },
    ],
    [
      "a non-factory branch",
      (f) => {
        f.pr.head.ref = "feature/human-work";
      },
    ],
    [
      "a fork branch",
      (f) => {
        f.pr.head = { ...f.pr.head, repo: { ...f.pr.head.repo, full_name: "outsider/solos" } };
      },
    ],
    [
      "a dismissed review",
      (f) => {
        f.review.state = "DISMISSED";
      },
    ],
    [
      "an unsubmitted review",
      (f) => {
        f.review.submitted_at = "";
      },
    ],
    [
      "an edited event",
      (f) => {
        f.payload.action = "edited";
      },
    ],
    [
      "Eve's own marker",
      (f) => {
        f.payload.comment.body = "<!-- eve:github:test -->";
      },
    ],
    [
      "GitHub API failure",
      (f) => {
        f.failApi = true;
      },
    ],
  ];
  test.each(ignored)("ignores %s", async (_name, change) => {
    const fixture = reviewFixture();
    change(fixture);
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
  });

  test("Codex timeline status summaries do not trigger fixes", async () => {
    const fixture = reviewFixture();
    fixture.payload.comment.body = "<!-- codex-pull-request-review-summary --> Latest activity";
    expect((await deliverReview(fixture, { event: "issue_comment" })).deliveries).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  });

  test("Codex replies in an existing review thread do not start another revision", async () => {
    const fixture = reviewFixture();
    fixture.payload.comment.in_reply_to_id = 90;
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
    expect(fixture.requests).toHaveLength(0);
  });

  test.each(["OWNER", "MEMBER", "COLLABORATOR", "NONE"])(
    "preserves the human mention gate for %s",
    async (association) => {
      const fixture = reviewFixture();
      const human = { id: 10, login: "maintainer", type: "User" };
      fixture.payload.sender = human;
      fixture.payload.comment.user = human;
      fixture.payload.comment.author_association = association;
      fixture.payload.comment.body = "@solos-factory please inspect this";
      const result = await deliverReview(fixture, { event: "issue_comment" });
      expect(result.deliveries).toHaveLength(association === "NONE" ? 0 : 1);
      if (association !== "NONE") expect(isTrusted(result.deliveries[0]?.options.auth)).toBe(true);
    },
  );
});
