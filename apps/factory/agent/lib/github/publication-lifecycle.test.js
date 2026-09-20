// @ts-check
import { describe, expect, test } from "bun:test";
import { hasValidTargetEvidence } from "./publication-evidence.js";
import { fullEvidence, OTHER_SHA, publicationFixture, TARGET_SHA } from "./publication-fixture.js";
import { publishRevisionEvidence, reconcileEvidencePublication } from "./publication-operation.js";
import { parsePublicationComment } from "./publication-record.js";

const publish = (fixture) =>
  publishRevisionEvidence(
    {
      pullNumber: 37,
      targetSha: TARGET_SHA,
      expectedRemoteHead: TARGET_SHA,
      remoteResult: "pushed",
      evidence: fullEvidence(),
    },
    fixture.context,
  );

describe("Evidence publication lifecycle", () => {
  test("publishes once after push and confirms after the exact check succeeds", async () => {
    const fixture = publicationFixture();
    const first = await publish(fixture);
    expect(first).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.bodyWrites).toBe(1);
    expect(fixture.state.comments).toHaveLength(1);
    expect(fixture.state.body).toContain("Human note.");
    expect(hasValidTargetEvidence(fixture.state.body, TARGET_SHA)).toBe(true);

    fixture.state.check = {
      name: "evidence",
      status: "completed",
      conclusion: "success",
      started_at: "2026-09-20T10:01:01.000Z",
      completed_at: "2026-09-20T10:02:00.000Z",
    };
    const confirmed = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(confirmed).toMatchObject({ status: "confirmed", repairAllowed: false });
    expect(fixture.state.bodyWrites).toBe(1);
    expect(fixture.state.comments).toHaveLength(1);
  });

  test("preserves valid exact-head Evidence byte-for-byte over another station report", async () => {
    const existing = fullEvidence().replace('"durationMs":7', '"durationMs":99');
    const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${existing}\n\`\`\`\n\n## Human\n\nKeep.\n`;
    const fixture = publicationFixture({
      body,
      check: {
        name: "evidence",
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-20T10:00:01.000Z",
        completed_at: "2026-09-20T10:00:30.000Z",
      },
    });
    const result = await publish(fixture);
    expect(result.status).toBe("confirmed");
    expect(fixture.state.body).toBe(body);
    expect(fixture.state.bodyWrites).toBe(0);
  });

  test("reordered stale failure refreshes only once and keeps one owner", async () => {
    const fixture = publicationFixture();
    await publish(fixture);
    fixture.state.check = {
      name: "evidence",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-09-20T10:00:01.000Z",
      completed_at: "2026-09-20T10:00:30.000Z",
    };
    const delayed = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(delayed).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.bodyWrites).toBe(2);
    await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(fixture.state.bodyWrites).toBe(2);
    expect(fixture.state.comments).toHaveLength(1);
  });

  test("a new head retires the earlier publication before taking ownership", async () => {
    const fixture = publicationFixture();
    await publish(fixture);
    fixture.state.head = OTHER_SHA;
    fixture.state.timeline.push({
      event: "synchronize",
      after_commit_id: OTHER_SHA,
      created_at: "2026-09-20T10:01:30.000Z",
    });
    await publishRevisionEvidence(
      {
        pullNumber: 37,
        targetSha: OTHER_SHA,
        expectedRemoteHead: OTHER_SHA,
        remoteResult: "pushed",
        evidence: fullEvidence(OTHER_SHA),
      },
      fixture.context,
    );
    const records = fixture.state.comments.map((comment) =>
      parsePublicationComment(String(comment.body)),
    );
    expect(records.map((record) => record?.outcome)).toEqual(["stale", "active"]);
  });
});
