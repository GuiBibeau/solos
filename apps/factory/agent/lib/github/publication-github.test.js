// @ts-check
import { describe, expect, test } from "bun:test";
import { TARGET_SHA } from "./publication-fixture.js";
import { remoteHeadChangedAt } from "./publication-github.js";

describe("Evidence publication remote-head clock", () => {
  test("uses the matching branch push time rather than long implementation time", () => {
    const events = [
      {
        event: "committed",
        sha: TARGET_SHA,
        committer: { date: "2026-09-20T09:00:00.000Z" },
      },
      {
        type: "PushEvent",
        created_at: "2026-09-20T10:00:00.000Z",
        payload: { ref: "refs/heads/factory/test", head: TARGET_SHA },
      },
      {
        type: "PushEvent",
        created_at: "2026-09-20T10:01:00.000Z",
        payload: { ref: "refs/heads/factory/other", head: TARGET_SHA },
      },
    ];
    expect(remoteHeadChangedAt(events, TARGET_SHA, "factory/test")).toBe(
      "2026-09-20T10:00:00.000Z",
    );
  });

  test("uses a conservative commit clock only when push activity is unavailable", () => {
    const events = [
      {
        event: "committed",
        sha: TARGET_SHA,
        committer: { date: "2026-09-20T09:00:00.000Z" },
      },
    ];
    expect(remoteHeadChangedAt(events, TARGET_SHA, "factory/test")).toBe(
      "2026-09-20T09:00:00.000Z",
    );
    expect(remoteHeadChangedAt([], TARGET_SHA, "factory/test")).toBeUndefined();
  });
});
