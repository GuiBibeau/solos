// @ts-check
import { describe, expect, test } from "bun:test";
import { fullEvidence, OTHER_SHA, publicationFixture, TARGET_SHA } from "./publication-fixture.js";
import { publishRevisionEvidence, reconcileEvidencePublication } from "./publication-operation.js";
import { parsePublicationComment } from "./publication-record.js";

/** @param {ReturnType<typeof publicationFixture>} fixture */
const publish = (fixture) =>
  publishRevisionEvidence(
    {
      pullNumber: 37,
      targetSha: TARGET_SHA,
      expectedRemoteHead: TARGET_SHA,
      remoteResult: "rebased",
      evidence: fullEvidence(),
    },
    fixture.context,
  );

describe("Evidence publication recovery", () => {
  test("claims a crash immediately after push and accepts the original Evidence once", async () => {
    const fixture = publicationFixture();
    const claimed = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(claimed).toMatchObject({ status: "active", repairAllowed: false });
    expect(claimed.reason).toContain("Waiting for the original verified Evidence");
    expect(fixture.state.comments).toHaveLength(1);
    expect(fixture.state.bodyWrites).toBe(0);
    const completed = await publish(fixture);
    expect(completed).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.comments).toHaveLength(1);
    expect(fixture.state.bodyWrites).toBe(1);
  });

  test("recovers a crash after body write without a second write", async () => {
    const fixture = publicationFixture();
    const original = fixture.state.comments;
    let commentWrites = 0;
    const api = async (path, init = {}) => {
      if (path.includes("/issues/comments/") && init.method === "PATCH") {
        commentWrites += 1;
        if (commentWrites === 2) throw new Error("crash after body write");
      }
      return fixture.api(path, init);
    };
    const context = { ...fixture.context, api };
    await expect(
      publishRevisionEvidence(
        {
          pullNumber: 37,
          targetSha: TARGET_SHA,
          expectedRemoteHead: TARGET_SHA,
          remoteResult: "pushed",
          evidence: fullEvidence(),
        },
        context,
      ),
    ).rejects.toThrow("crash after body write");
    expect(fixture.state.bodyWrites).toBe(1);
    expect(fixture.state.comments).toBe(original);
    const recovered = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(recovered).toMatchObject({ status: "active", repairAllowed: false });
    expect(fixture.state.bodyWrites).toBe(1);
    const record = parsePublicationComment(String(fixture.state.comments[0]?.body));
    expect(record?.stage).toBe("body-written");
    expect(record?.mutationAt).toBe(fixture.state.updatedAt);
  });

  test("stops stale publication when the head changes before its body write", async () => {
    const fixture = publicationFixture();
    let pullReads = 0;
    const api = async (path, init = {}) => {
      if (path.endsWith("/pulls/37") && init.method === undefined) {
        pullReads += 1;
        if (pullReads === 3) fixture.state.head = OTHER_SHA;
      }
      return fixture.api(path, init);
    };
    const result = await publishRevisionEvidence(
      {
        pullNumber: 37,
        targetSha: TARGET_SHA,
        expectedRemoteHead: TARGET_SHA,
        remoteResult: "pushed",
        evidence: fullEvidence(),
      },
      { ...fixture.context, api },
    );
    expect(result).toMatchObject({ status: "stale", repairAllowed: true });
    expect(fixture.state.bodyWrites).toBe(0);
  });

  test("preserves a human body edit fetched immediately before writing", async () => {
    const fixture = publicationFixture();
    let pullReads = 0;
    const api = async (path, init = {}) => {
      if (path.endsWith("/pulls/37") && init.method === undefined) {
        pullReads += 1;
        if (pullReads === 3) fixture.state.body += "\nConcurrent human edit.\n";
      }
      return fixture.api(path, init);
    };
    await publishRevisionEvidence(
      {
        pullNumber: 37,
        targetSha: TARGET_SHA,
        expectedRemoteHead: TARGET_SHA,
        remoteResult: "pushed",
        evidence: fullEvidence(),
      },
      { ...fixture.context, api },
    );
    expect(fixture.state.body).toContain("Concurrent human edit.");
  });

  test("expires once from remote head time and never permits a feature relaunch", async () => {
    const fixture = publicationFixture({ now: "2026-09-20T10:10:00.000Z" });
    const expired = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(expired).toMatchObject({
      status: "failed",
      repairAllowed: false,
      reportActionable: true,
      deadlineAt: "2026-09-20T10:10:00.000Z",
    });
    expect(fixture.state.bodyWrites).toBe(0);
    const repeat = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
    expect(repeat).toMatchObject({ status: "failed", repairAllowed: false });
    expect(repeat.reportActionable).toBe(false);
  });
});
