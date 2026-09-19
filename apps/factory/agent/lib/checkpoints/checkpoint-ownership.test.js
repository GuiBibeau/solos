// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointSaver } from "./checkpoint-saver.js";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeEventHandler, createRuntimeObserver } from "./runtime-observer.js";
import { createCheckpointStore } from "./store.js";
import { createTaskBindingStore } from "./task-binding.js";
import { createSaveCheckpointTool } from "./tools.js";

const stationContext = (turnId) =>
  /** @type {import("eve/tools").ToolContext} */ ({
    abortSignal: new AbortController().signal,
    callId: `save-${turnId}`,
    session: {
      id: "reused-station-session",
      parent: {
        callId: "original-creation-call",
        rootSessionId: "root-session",
        sessionId: "parent-session",
        turn: { id: "original-parent-turn", sequence: 0 },
      },
      turn: { id: turnId, sequence: 2 },
    },
    toolName: "save-station-checkpoint",
  });

const dispatchEvent = (sequence, turnId, callId) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data: {
      callId,
      childSessionId: "reused-station-session",
      childStreamPath: "/stream/reused-station-session",
      name: "implementer",
      sequence,
      sessionId: "root-session",
      toolName: "implementer",
      turnId,
      workflowId: "workflow//eve//workflowEntry",
    },
    meta: { at: `2026-09-19T00:00:0${sequence}Z`, id: `root-event-${sequence}` },
    type: "subagent.called",
  });

const rootContext = (turnId) =>
  /** @type {import("eve/hooks").HookContext} */ ({
    session: { id: "root-session", turn: { id: turnId, sequence: 0 } },
  });

test("real dispatch events transfer reused-session checkpoint ownership", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const bindings = createTaskBindingStore(memory.io);
  const handle = createRuntimeEventHandler(observer, bindings);
  const save = createCheckpointSaver(checkpoints, observer, bindings);
  const tool = createSaveCheckpointTool("implementer", save);
  const firstTaskId = "task_8c9d4d5c89c15f4286a4ebcf";
  const secondTaskId = "task_1d70ee6ad1962c1e2fba202d";
  const first = { ...issue18Checkpoint, revision: 1 };
  Reflect.deleteProperty(first, "stationRunId");
  Reflect.deleteProperty(first, "taskId");
  Reflect.deleteProperty(first, "usage");

  expect(await tool.execute(first, stationContext("station-turn-1"))).toMatchObject({
    error: "Current station task binding is unavailable.",
    saved: false,
  });
  memory.failAfterNextWrite();
  await handle(dispatchEvent(1, "root-turn-1", "root-call-1"), rootContext("root-turn-1"));
  expect(await tool.execute(first, stationContext("station-turn-1"))).toMatchObject({
    saved: true,
  });

  await handle(dispatchEvent(2, "root-turn-2", "root-call-2"), rootContext("root-turn-2"));
  await handle(dispatchEvent(1, "root-turn-1", "root-call-1"), rootContext("root-turn-1"));
  const replacement = { ...first, revision: 2 };
  expect(await tool.execute(replacement, stationContext("station-turn-2"))).toMatchObject({
    saved: false,
  });
  expect(
    await tool.execute(
      { ...replacement, supersededTaskIds: [firstTaskId] },
      stationContext("station-turn-2"),
    ),
  ).toMatchObject({ saved: true });
  expect(await checkpoints.read(first)).toMatchObject({
    checkpoint: { stationRunId: "reused-station-session", taskId: secondTaskId },
    found: true,
  });
});
