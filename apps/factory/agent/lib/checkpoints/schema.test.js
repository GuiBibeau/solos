// @ts-check
import { expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { StationCheckpointSchema } from "./schema.js";

test("the issue #18 handoff preserves work, diagnostics, and the static-check milestone", () => {
  expect(issue18Checkpoint.branch?.dirtyFiles).toHaveLength(1);
  expect(issue18Checkpoint.diagnostics.slice(0, 4)).toHaveLength(4);
  expect(issue18Checkpoint.diagnostics).toContain("unresolved main alignment");
  expect(issue18Checkpoint.diagnostics).toContain("oversized validator concern");
  expect(issue18Checkpoint.nextMilestone).toContain("static-check");
  expect(issue18Checkpoint.usage?.billedCostUsd).toBeUndefined();
  expect(issue18Checkpoint.usage?.cachedInputTokens).toBeUndefined();
});

test("billed cost is accepted only with an authoritative source", () => {
  const usage = { accountingScope: "station", billedCostUsd: 1 };
  expect(StationCheckpointSchema.safeParse({ ...issue18Checkpoint, usage }).success).toBeFalse();
  const sourced = { ...usage, billedCostSource: "provider invoice usage" };
  expect(
    StationCheckpointSchema.safeParse({ ...issue18Checkpoint, usage: sourced }).success,
  ).toBeTrue();
});

test("checkpoint operations are completed, never inferred from an in-flight tool", () => {
  expect(
    StationCheckpointSchema.safeParse({
      ...issue18Checkpoint,
      latestOperation: { ...issue18Checkpoint.latestOperation, status: "running" },
    }).success,
  ).toBeFalse();
});
