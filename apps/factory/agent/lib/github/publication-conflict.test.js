// @ts-check
import { describe, expect, test } from "bun:test";
import { evidenceRaw, hasValidTargetEvidence } from "./publication-evidence.js";
import { fullEvidence, publicationFixture, TARGET_SHA } from "./publication-fixture.js";
import { publishRevisionEvidence } from "./publication-operation.js";
import { hasPublicationRefresh } from "./publication-refresh.js";

const OPERATION_ID = `evidence:37:${TARGET_SHA}`;

/** @param {ReturnType<typeof publicationFixture>} fixture @param {number} editOnRead */
const concurrentEditApi = (fixture, editOnRead) => {
  let pullReads = 0;
  return async (path, init = {}) => {
    if (path.endsWith("/pulls/37") && init.method === undefined) {
      pullReads += 1;
      if (pullReads === editOnRead) {
        fixture.state.body += "\nConcurrent human edit.\n";
        fixture.state.updatedAt = "2026-09-20T10:00:30.000Z";
      }
    }
    return fixture.api(path, init);
  };
};

/** @param {ReturnType<typeof publicationFixture>} fixture @param {number} editOnRead */
const publish = (fixture, editOnRead) =>
  publishRevisionEvidence(
    {
      pullNumber: 37,
      targetSha: TARGET_SHA,
      expectedRemoteHead: TARGET_SHA,
      remoteResult: "pushed",
      evidence: fullEvidence(),
    },
    { ...fixture.context, api: concurrentEditApi(fixture, editOnRead) },
  );

describe("Evidence body optimistic merge", () => {
  test("preserves a human edit detected in the Evidence final write guard", async () => {
    const fixture = publicationFixture();
    await publish(fixture, 5);
    expect(fixture.state.body).toContain("Concurrent human edit.");
    expect(hasValidTargetEvidence(fixture.state.body, TARGET_SHA)).toBe(true);
    expect(fixture.state.bodyWrites).toBe(1);
  });

  test("preserves a human edit detected in the marker final write guard", async () => {
    const evidence = fullEvidence();
    const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${evidence}\n\`\`\`\n`;
    const fixture = publicationFixture({
      body,
      check: {
        name: "evidence",
        status: "completed",
        conclusion: "failure",
        started_at: "2026-09-20T10:00:01.000Z",
        completed_at: "2026-09-20T10:00:20.000Z",
      },
    });
    await publish(fixture, 3);
    expect(fixture.state.body).toContain("Concurrent human edit.");
    expect(evidenceRaw(fixture.state.body)).toBe(evidence);
    expect(hasPublicationRefresh(fixture.state.body, OPERATION_ID)).toBe(true);
    expect(fixture.state.bodyWrites).toBe(1);
  });
});
