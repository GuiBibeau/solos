// @ts-check
import { describe, expect, test } from "bun:test";
import { evidenceRaw } from "./publication-evidence.js";
import { fullEvidence, publicationFixture, TARGET_SHA } from "./publication-fixture.js";
import { publishRevisionEvidence, reconcileEvidencePublication } from "./publication-operation.js";
import { parsePublicationComment } from "./publication-record.js";
import { hasPublicationRefresh } from "./publication-refresh.js";

const OPERATION_ID = `evidence:37:${TARGET_SHA}`;
const staleCheck = {
  name: "evidence",
  status: "completed",
  conclusion: "failure",
  started_at: "2026-09-20T10:00:01.000Z",
  completed_at: "2026-09-20T10:02:00.000Z",
};

/** @param {ReturnType<typeof publicationFixture>} fixture */
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

describe("Evidence refresh marker", () => {
  test("changes a valid body once for a stale failure and preserves Evidence", async () => {
    const evidence = fullEvidence();
    const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${evidence}\n\`\`\`\n`;
    const fixture = publicationFixture({ body, check: staleCheck });
    const refreshing = await publish(fixture);
    expect(refreshing).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.body).not.toBe(body);
    expect(evidenceRaw(fixture.state.body)).toBe(evidence);
    expect(hasPublicationRefresh(fixture.state.body, OPERATION_ID)).toBe(true);
    expect(fixture.state.bodyWrites).toBe(1);
    const record = parsePublicationComment(String(fixture.state.comments[0]?.body));
    expect(record?.mutationAt).toBe(fixture.state.updatedAt);
    await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(fixture.state.bodyWrites).toBe(1);
  });

  test("recovers a crash after marker write without mutating the body again", async () => {
    const evidence = fullEvidence();
    const body = `Intro\n\n## Evidence\n\n\`\`\`json\n${evidence}\n\`\`\`\n`;
    const fixture = publicationFixture({ body, check: staleCheck });
    const api = async (path, init = {}) => {
      if (path.includes("/issues/comments/") && init.method === "PATCH")
        throw new Error("crash before refresh record save");
      return fixture.api(path, init);
    };
    await expect(
      publishRevisionEvidence(
        {
          pullNumber: 37,
          targetSha: TARGET_SHA,
          expectedRemoteHead: TARGET_SHA,
          remoteResult: "pushed",
          evidence,
        },
        { ...fixture.context, api },
      ),
    ).rejects.toThrow("crash before refresh record save");
    expect(fixture.state.bodyWrites).toBe(1);
    expect(hasPublicationRefresh(fixture.state.body, OPERATION_ID)).toBe(true);
    const recovered = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(recovered).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.bodyWrites).toBe(1);
    const record = parsePublicationComment(String(fixture.state.comments[0]?.body));
    expect(record?.stage).toBe("refresh-requested");
    expect(record?.mutationAt).toBe(fixture.state.updatedAt);
  });
});
