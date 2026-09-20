// @ts-check
import { expect, test } from "bun:test";
import { evidenceRaw } from "./publication-evidence.js";
import { fullEvidence, publicationFixture, TARGET_SHA } from "./publication-fixture.js";
import { publishRevisionEvidence, reconcileEvidencePublication } from "./publication-operation.js";

test("a genuine refreshed verifier failure is not treated as publication delay", async () => {
  const evidence = fullEvidence();
  const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${evidence}\n\`\`\`\n`;
  const fixture = publicationFixture({
    body,
    check: {
      name: "evidence",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-09-20T10:00:01.000Z",
      completed_at: "2026-09-20T10:00:30.000Z",
    },
  });
  const refreshing = await publishRevisionEvidence(
    {
      pullNumber: 37,
      targetSha: TARGET_SHA,
      expectedRemoteHead: TARGET_SHA,
      remoteResult: "pushed",
      evidence,
    },
    fixture.context,
  );
  expect(refreshing).toMatchObject({ status: "active", repairAllowed: false });
  expect(evidenceRaw(fixture.state.body)).toBe(evidence);
  fixture.state.check = {
    name: "evidence",
    status: "completed",
    conclusion: "failure",
    started_at: "2026-09-20T10:01:01.000Z",
    completed_at: "2026-09-20T10:02:00.000Z",
  };
  const failed = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
  expect(failed).toMatchObject({ status: "failed", repairAllowed: false, reportActionable: true });
  expect(failed.reason).toContain("genuinely failed");
});

test("a stale check completing after refresh remains publication delay", async () => {
  const evidence = fullEvidence();
  const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${evidence}\n\`\`\`\n`;
  const fixture = publicationFixture({
    body,
    check: {
      name: "evidence",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-09-20T10:00:01.000Z",
      completed_at: "2026-09-20T10:00:30.000Z",
    },
  });
  const refreshing = await publishRevisionEvidence(
    {
      pullNumber: 37,
      targetSha: TARGET_SHA,
      expectedRemoteHead: TARGET_SHA,
      remoteResult: "pushed",
      evidence,
    },
    fixture.context,
  );
  expect(refreshing).toMatchObject({ status: "active", repairAllowed: false });
  fixture.state.check = {
    name: "evidence",
    status: "completed",
    conclusion: "failure",
    started_at: "2026-09-20T10:00:59.000Z",
    completed_at: "2026-09-20T10:02:00.000Z",
  };
  const waiting = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
  expect(waiting).toMatchObject({ status: "active", repairAllowed: false });
  expect(waiting.reason).toContain("refresh is pending");
});
