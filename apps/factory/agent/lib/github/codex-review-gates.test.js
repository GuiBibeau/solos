// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { isTrusted } from "../trust.js";
import { CODEX_USER, deliverReview, reviewFixture } from "./review-webhook-fixture.js";

const previousBotName = process.env.FACTORY_BOT_NAME;
beforeAll(() => {
  process.env.FACTORY_BOT_NAME = "solos-factory";
});
afterAll(() => {
  if (previousBotName === undefined) delete process.env.FACTORY_BOT_NAME;
  else process.env.FACTORY_BOT_NAME = previousBotName;
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
    "a stale comment",
    (f) => {
      f.comments = f.comments.map((c) => ({ ...c, commit_id: "b".repeat(40) }));
    },
  ],
  ["a closed PR", (f) => (f.pr.state = "closed")],
  ["a non-factory branch", (f) => (f.pr.head.ref = "feature/human-work")],
  [
    "a fork branch",
    (f) => {
      f.pr.head = { ...f.pr.head, repo: { ...f.pr.head.repo, full_name: "outsider/solos" } };
    },
  ],
  ["a dismissed review", (f) => (f.review.state = "DISMISSED")],
  ["an unsubmitted review", (f) => (f.review.submitted_at = "")],
  ["an edited event", (f) => (f.payload.action = "edited")],
  ["Eve's own marker", (f) => (f.payload.comment.body = "<!-- eve:github:test -->")],
  ["GitHub API failure", (f) => (f.failApi = true)],
];

describe("[integration] Codex review gates", () => {
  test.each(ignored)("ignores %s", async (_name, change) => {
    const fixture = reviewFixture();
    change(fixture);
    expect((await deliverReview(fixture)).deliveries).toHaveLength(0);
  });

  test("status summaries and review replies do not trigger fixes", async () => {
    const summary = reviewFixture();
    summary.payload.comment.body = "<!-- codex-pull-request-review-summary --> Latest activity";
    expect((await deliverReview(summary, { event: "issue_comment" })).deliveries).toHaveLength(0);
    const reply = reviewFixture();
    reply.payload.comment.in_reply_to_id = 90;
    expect((await deliverReview(reply)).deliveries).toHaveLength(0);
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
