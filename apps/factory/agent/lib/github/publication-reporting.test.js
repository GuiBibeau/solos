// @ts-check
import { expect, test } from "bun:test";
import { publicationFixture } from "./publication-fixture.js";
import { reconcileEvidencePublication } from "./publication-operation.js";
import { parsePublicationComment } from "./publication-record.js";

test("a crash before durable failure reporting retries the visible reason", async () => {
  const fixture = publicationFixture({ now: "2026-09-20T10:10:00.000Z" });
  const api = async (path, init = {}) => {
    if (path.includes("/issues/comments/") && init.method === "PATCH")
      throw new Error("crash before actionable failure is durable");
    return fixture.api(path, init);
  };
  await expect(
    reconcileEvidencePublication({ pullNumber: 37 }, { ...fixture.context, api }),
  ).rejects.toThrow("crash before actionable failure is durable");
  expect(String(fixture.state.comments[0]?.body)).not.toContain("Action required:");
  expect(parsePublicationComment(String(fixture.state.comments[0]?.body))?.failureReportedAt).toBe(
    undefined,
  );
  const retried = await reconcileEvidencePublication({ pullNumber: 37 }, fixture.context);
  expect(retried).toMatchObject({ status: "failed", reportActionable: true });
  expect(String(fixture.state.comments[0]?.body)).toContain("Action required:");
  expect(parsePublicationComment(String(fixture.state.comments[0]?.body))?.failureReportedAt).toBe(
    fixture.state.now,
  );
});
