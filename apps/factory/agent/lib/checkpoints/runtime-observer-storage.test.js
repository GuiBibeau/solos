// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointReader } from "./checkpoint-reader.js";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { issue18Checkpoint } from "./fixtures.js";
import { runtimeEvent } from "./runtime-event-fixtures.js";
import { createRuntimeEventHandler, createRuntimeObserver } from "./runtime-observer.js";
import { stationView } from "./status.js";
import { createCheckpointStore } from "./store.js";

test("checkpoint reads join activity by the stored station run id", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const checkpoint = {
    ...issue18Checkpoint,
    outcome: /** @type {const} */ ("active"),
    revision: 1,
  };
  await checkpoints.save(checkpoint);
  await observer.observe(
    runtimeEvent("session.completed", 1),
    checkpoint.stationRunId ?? "missing",
  );
  const read = createCheckpointReader(checkpoints, observer);
  expect(await read(checkpoint)).toMatchObject({
    found: true,
    view: { cursor: "trace-page-4", redispatch: false, status: "completed" },
  });
});

test("ordered event ids reject duplicates and delayed older events", async () => {
  const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
  const usage = runtimeEvent("step.completed", 2, {
    finishReason: "stop",
    sequence: 2,
    stepIndex: 0,
    turnId: "turn-1",
    usage: { cacheReadTokens: 3, costUsd: 0.01, inputTokens: 10, outputTokens: 2 },
  });
  await observer.observe(usage, "station-run");
  await observer.observe(usage, "station-run");
  await observer.observe(runtimeEvent("turn.started", 1), "station-run");
  expect(await observer.read("station-run")).toMatchObject({
    observation: { lastEventId: "event-0002", revision: 1, usage: { inputTokens: 10 } },
  });
});

test("runtime persistence errors reject the hook instead of losing the event", async () => {
  const failure = new Error("blob unavailable");
  const observer = {
    observe: async () => {
      throw failure;
    },
  };
  const handler = createRuntimeEventHandler(observer);
  const ctx = /** @type {import("eve/hooks").HookContext} */ ({
    session: {
      id: "station-run",
      parent: {
        callId: "call",
        rootSessionId: "root",
        sessionId: "parent",
        turn: { id: "turn", sequence: 0 },
      },
    },
  });
  expect(handler(runtimeEvent("turn.completed", 1), ctx)).rejects.toBe(failure);
});

test("terminal, replacement, slow, cancelled, and timeout states remain deterministic", async () => {
  const cases = /** @type {const} */ ([
    ["session.completed", "completed"],
    ["turn.started", "active"],
    ["actions.requested", "active"],
    ["session.failed", "failed"],
    ["turn.cancelled", "failed"],
  ]);
  for (const [type, expected] of cases) {
    const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
    await observer.observe(runtimeEvent(type, 1), `run-${type}`);
    const stored = await observer.read(`run-${type}`);
    if (!stored.found || stored.observation === undefined) throw new Error("observation missing");
    const checkpoint = {
      ...issue18Checkpoint,
      outcome: type === "turn.started" ? "superseded" : "active",
      updatedAt: "2026-09-18T23:59:59.000Z",
    };
    expect(stationView(checkpoint, stored.observation).status).toBe(expected);
  }
  expect(
    stationView({ ...issue18Checkpoint, outcome: "active" }, { observationTimedOut: true }),
  ).toMatchObject({ redispatch: false, status: "unknown" });
});
