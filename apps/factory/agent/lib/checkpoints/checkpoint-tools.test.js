// @ts-check
import { expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";
import { createCheckpointStore } from "./store.js";
import { createCheckpointReader, createCheckpointSaver } from "./tools.js";

const memoryIo = () => {
  /** @type {Map<string, {content: string; etag: string}>} */
  const documents = new Map();
  let version = 0;
  return {
    read: async (/** @type {string} */ key) => {
      const value = documents.get(key);
      return value === undefined
        ? { found: /** @type {const} */ (false) }
        : { ...value, found: /** @type {const} */ (true), uploadedAt: "2026-09-19T00:00:00Z" };
    },
    write: async (key, content, options) => {
      const current = documents.get(key);
      if (options.ifMatch !== undefined && options.ifMatch !== current?.etag)
        throw new Error("conflict");
      version += 1;
      documents.set(key, { content, etag: `etag-${version}` });
    },
  };
};

test("save injects runtime identity and authoritative provider usage", async () => {
  const io = memoryIo();
  const checkpoints = createCheckpointStore(io);
  const observer = createRuntimeObserver(io);
  const completed = /** @type {import("eve/hooks").HookEvent} */ ({
    data: {
      finishReason: "stop",
      sequence: 1,
      stepIndex: 0,
      turnId: "turn-1",
      usage: { cacheReadTokens: 3, costUsd: 0.01, inputTokens: 10, outputTokens: 2 },
    },
    meta: { at: "2026-09-19T00:00:01Z", id: "event-1" },
    type: "step.completed",
  });
  await observer.observe(completed, "runtime-session");
  const candidate = { ...issue18Checkpoint };
  Reflect.deleteProperty(candidate, "stationRunId");
  Reflect.deleteProperty(candidate, "taskId");
  Reflect.deleteProperty(candidate, "usage");
  const save = createCheckpointSaver(checkpoints, observer);
  const ctx = /** @type {import("eve/tools").SessionContext} */ ({
    session: {
      id: "runtime-session",
      parent: { callId: "runtime-call" },
      turn: { id: "runtime-turn" },
    },
  });

  expect(await save({ ...candidate, revision: 1 }, ctx)).toMatchObject({ saved: true });
  expect(await checkpoints.read(candidate)).toMatchObject({
    checkpoint: {
      stationRunId: "runtime-session",
      taskId: "runtime-call",
      usage: {
        billedCostSource: "eve.step.completed.usage.costUsd",
        billedCostUsd: 0.01,
        cachedInputTokens: 3,
        inputTokens: 10,
        outputTokens: 2,
      },
    },
  });

  const nextUsage = {
    ...completed,
    data: {
      ...completed.data,
      usage: { cacheReadTokens: 1, costUsd: 0.02, inputTokens: 5, outputTokens: 1 },
    },
    meta: { at: "2026-09-19T00:00:02Z", id: "event-2" },
  };
  await observer.observe(nextUsage, "runtime-session");
  const read = createCheckpointReader(checkpoints, observer);
  expect(await read(candidate)).toMatchObject({
    checkpoint: {
      usage: {
        billedCostUsd: 0.03,
        cachedInputTokens: 4,
        inputTokens: 15,
        outputTokens: 3,
      },
    },
  });
});
