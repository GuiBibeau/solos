// @ts-check
import { describe, expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { StationCheckpointSchema } from "./schema.js";
import { blockerStatus, monitoringBackoffMs, reportUsage, stationView } from "./status.js";

/** @param {import("./schema.js").StationCheckpoint["outcome"]} outcome */
const withOutcome = (outcome) => ({ ...issue18Checkpoint, outcome });

describe("station lifecycle replay", () => {
  test("completed task beats a stale running session label", () => {
    const view = stationView(withOutcome("active"), {
      cursor: "next-page",
      sessionStatus: "running",
      taskOutcome: "completed",
    });
    expect(view).toMatchObject({ cursor: "next-page", redispatch: false, status: "completed" });
  });

  test("a superseded task with an active replacement remains active", () => {
    const view = stationView(withOutcome("superseded"), {
      taskOutcome: "active",
    });
    expect(view.status).toBe("active");
    expect(view.redispatch).toBeFalse();
  });

  test("slow tools stay active and observation timeouts never authorize redispatch", () => {
    expect(stationView(withOutcome("active"), { taskOutcome: "active" }).status).toBe("active");
    expect(stationView(withOutcome("active"), { observationTimedOut: true })).toMatchObject({
      redispatch: false,
      status: "unknown",
    });
  });

  test("a budget pause wins over stale activity without changing the budget", () => {
    const view = stationView(issue18Checkpoint, {
      sessionStatus: "running",
      taskOutcome: "active",
    });
    expect(view.status).toBe("budget_paused");
  });
});

test("unchanged blockers escalate once and monitoring backoff is bounded", () => {
  expect(blockerStatus(issue18Checkpoint)).toMatchObject({
    attempts: 2,
    shouldEscalate: true,
  });
  const emitted = StationCheckpointSchema.parse({
    ...issue18Checkpoint,
    blocker: {
      ...issue18Checkpoint.blocker,
      escalationEmittedAt: issue18Checkpoint.updatedAt,
      escalationMessage: "Implementer remains blocked after the attempted static-check correction.",
    },
  });
  expect(blockerStatus(emitted)).toMatchObject({
    escalationMessage: expect.stringContaining("remains blocked"),
    shouldEscalate: false,
  });
  expect(monitoringBackoffMs(0)).toBe(5000);
  expect(monitoringBackoffMs(100)).toBe(300_000);
});

test("root aggregate usage is not double counted with children", () => {
  const root = {
    accountingScope: /** @type {const} */ ("root_aggregate"),
    billedCostSource: "provider invoice usage",
    billedCostUsd: 2,
    inputTokens: 100,
    outputTokens: 20,
  };
  expect(reportUsage([root, { accountingScope: "station", inputTokens: 60 }])).toEqual(root);
});

test("station usage preserves one authoritative billed cost", () => {
  const usage = reportUsage([
    {
      accountingScope: "station",
      billedCostSource: "provider invoice usage",
      billedCostUsd: 1,
      inputTokens: 12,
    },
  ]);
  expect(usage).toEqual({
    accountingScope: "station",
    billedCostSource: "provider invoice usage",
    billedCostUsd: 1,
    inputTokens: 12,
  });
});

test("station cost stays unavailable when aggregation would be incomplete", () => {
  expect(
    reportUsage([
      { accountingScope: "station", billedCostSource: "invoice", billedCostUsd: 1 },
      { accountingScope: "station", inputTokens: 12 },
    ]),
  ).toEqual({ accountingScope: "station", inputTokens: 12 });
});
