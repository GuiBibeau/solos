// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointReader } from "./checkpoint-reader.js";
import { createCheckpointSaver } from "./checkpoint-saver.js";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";
import { stationDeliveryMessage } from "./station-delivery.js";
import { createCheckpointStore } from "./store.js";
import { createTaskBindingStore } from "./task-binding.js";

const usageEvent = (id, inputTokens = 10) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data: {
      finishReason: "stop",
      sequence: 1,
      stepIndex: 0,
      turnId: "turn-1",
      usage: { cacheReadTokens: 3, costUsd: 0.01, inputTokens, outputTokens: 2 },
    },
    meta: { at: "2026-09-19T00:00:01Z", id },
    type: "step.completed",
  });
const childUsageEvent = () =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data: {
      result: {
        callId: "runtime-call",
        kind: "subagent-result",
        origin: "child",
        outcome: { kind: "completed", usageDelta: {} },
        output: {},
        subagentName: "implementer",
        usage: { cacheReadTokens: 1, cacheWriteTokens: 0, inputTokens: 5, outputTokens: 1 },
      },
      sequence: 2,
      status: "completed",
      stepIndex: 1,
      turnId: "root-turn",
    },
    meta: { at: "2026-09-19T00:00:02Z", id: "root-event-0002" },
    type: "action.result",
  });

const childContext = () =>
  /** @type {import("eve/tools").SessionContext} */ ({
    session: {
      id: "runtime-session",
      parent: {
        callId: "runtime-call",
        rootSessionId: "root-session",
        sessionId: "parent-session",
        turn: { id: "parent-turn", sequence: 0 },
      },
      turn: { id: "runtime-turn", sequence: 0 },
    },
  });

const writableCheckpoint = () => {
  const candidate = { ...issue18Checkpoint };
  Reflect.deleteProperty(candidate, "stationRunId");
  Reflect.deleteProperty(candidate, "supersededTaskIds");
  Reflect.deleteProperty(candidate, "taskId");
  Reflect.deleteProperty(candidate, "usage");
  return candidate;
};

const boundRuntime = async (memory, observer) => {
  const bindings = createTaskBindingStore(memory.io);
  const identity = {
    rootRunId: issue18Checkpoint.rootRunId,
    station: "implementer",
    workItem: issue18Checkpoint.workItem,
  };
  const taskId = "task_336135bd2632c09d3de51f9d";
  await bindings.observe(
    /** @type {import("eve/hooks").HookEvent} */ ({
      data: {
        message: stationDeliveryMessage({ ...identity, taskId }, "Continue implementation."),
        sequence: 0,
        turnId: "runtime-turn",
      },
      meta: { at: "2026-09-19T00:00:00Z", id: "delivery-event" },
      type: "message.received",
    }),
    /** @type {import("eve/hooks").HookContext} */ ({
      ...childContext(),
      agent: { name: "implementer" },
      channel: {},
    }),
  );
  return createCheckpointSaver(createCheckpointStore(memory.io), observer, bindings);
};

test("save injects the runtime-bound task identity and provider usage", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  await observer.observe(usageEvent("event-0001"), "runtime-session");
  const save = await boundRuntime(memory, observer);
  const candidate = writableCheckpoint();
  await save({ ...candidate, cursor: "model-invented", revision: 1 }, childContext());
  expect(await checkpoints.read(candidate)).toMatchObject({
    checkpoint: {
      stationRunId: "runtime-session",
      taskId: "task_336135bd2632c09d3de51f9d",
      usage: {
        billedCostSource: "eve.runtime.provider-reported",
        billedCostUsd: 0.01,
        cachedInputTokens: 3,
        inputTokens: 10,
        outputTokens: 2,
      },
    },
  });
  expect((await checkpoints.read(candidate)).checkpoint).not.toHaveProperty("cursor");
});

test("reads refresh station usage from the runtime observation", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const candidate = writableCheckpoint();
  const save = await boundRuntime(memory, observer);
  await observer.observe(usageEvent("event-0001"), "runtime-session");
  await save({ ...candidate, revision: 1 }, childContext());
  await observer.observe(usageEvent("event-0002", 5), "runtime-session");
  const read = createCheckpointReader(checkpoints, observer);
  expect(await read(candidate)).toMatchObject({
    checkpoint: { usage: { billedCostUsd: 0.02, inputTokens: 15, outputTokens: 4 } },
    usage: { accountingScope: "station", inputTokens: 15 },
  });
});

test("root aggregate usage includes child usage exactly once", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  await checkpoints.save({ ...issue18Checkpoint, revision: 1, stationRunId: "runtime-session" });
  await observer.observe(usageEvent("root-event-0001", 20), "root-session", "root_aggregate");
  await observer.observe(childUsageEvent(), "root-session", "root_aggregate");
  await observer.observe(usageEvent("station-event-0001", 5), "runtime-session");
  const read = createCheckpointReader(checkpoints, observer);
  expect(await read(issue18Checkpoint, childContext())).toMatchObject({
    checkpoint: { usage: { accountingScope: "station", inputTokens: 5 } },
    usage: { accountingScope: "root_aggregate", inputTokens: 25 },
  });
});
