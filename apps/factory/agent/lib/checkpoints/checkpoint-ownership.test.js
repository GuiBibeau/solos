// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointSaver } from "./checkpoint-saver.js";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeEventHandler, createRuntimeObserver } from "./runtime-observer.js";
import { bindAndDispatchStation } from "./station-dispatch.js";
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

const dispatchContext = (sequence, onAgent) =>
  /** @type {import("eve/tools").WorkflowToolContext} */ ({
    agent: onAgent,
    callId: `dispatch-${sequence}`,
    session: {
      id: "root-session",
      turn: { id: `root-turn-${sequence}`, sequence },
    },
    toolName: "dispatch-implementer",
  });

const taskContext = (taskId) => /** @type {import("eve/tools").TaskExec} */ ({ taskId });

const deliveryEvent = (message, turnId, sequence) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data: { message, sequence, turnId },
    meta: { at: `2099-09-19T00:00:0${sequence}Z`, id: `delivery-${sequence}` },
    type: "message.received",
  });

const hookContext = (turnId) =>
  /** @type {import("eve/hooks").HookContext} */ ({
    agent: { name: "implementer" },
    channel: {},
    session: stationContext(turnId).session,
  });

test("real dispatch tools transfer reused-session checkpoint ownership", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const bindings = createTaskBindingStore(memory.io);
  const handle = createRuntimeEventHandler(observer, bindings);
  const save = createCheckpointSaver(checkpoints, observer, bindings);
  const tool = createSaveCheckpointTool("implementer", save);
  const firstTaskId = "task_111111111111111111111111";
  const secondTaskId = "task_222222222222222222222222";
  const first = { ...issue18Checkpoint, revision: 1 };
  Reflect.deleteProperty(first, "stationRunId");
  Reflect.deleteProperty(first, "supersededTaskIds");
  Reflect.deleteProperty(first, "taskId");
  Reflect.deleteProperty(first, "usage");

  expect(await tool.execute(first, stationContext("station-turn-1"))).toMatchObject({
    error: "Current station task binding is unavailable.",
    saved: false,
  });
  await expect(
    handle(
      deliveryEvent(
        "[solos-station:task_aaaaaaaaaaaaaaaaaaaaaaaa|reviewer|wrun_18|GuiBibeau/solos#18]\nGuess",
        "forged-turn",
        0,
      ),
      hookContext("forged-turn"),
    ),
  ).rejects.toThrow("Station delivery target mismatch.");
  memory.failAfterNextWrite();
  const dispatchInput = {
    message: "Implement the approved plan.",
    rootRunId: issue18Checkpoint.rootRunId,
    workItem: issue18Checkpoint.workItem,
  };
  /** @param {string} taskId @param {string} turnId @param {number} sequence */
  const deliver =
    (taskId, turnId, sequence) =>
    async (/** @type {string} */ target, /** @type {import("eve/tools").AgentInput} */ input) => {
      expect(target).toBe("implementer");
      expect(input.message).toStartWith(`[solos-station:${taskId}|implementer|`);
      await handle(deliveryEvent(input.message, turnId, sequence), hookContext(turnId));
      expect(
        await bindings.read({
          stationRunId: "reused-station-session",
          turnId,
        }),
      ).toMatchObject({ binding: { taskId } });
      return {};
    };
  await bindAndDispatchStation(
    { input: dispatchInput, station: "implementer" },
    {
      ctx: dispatchContext(1, deliver(firstTaskId, "station-turn-1", 1)),
      task: taskContext(firstTaskId),
      authorizations: bindings.authorizations,
    },
  );
  expect(await tool.execute(first, stationContext("station-turn-1"))).toMatchObject({
    saved: true,
  });

  await bindAndDispatchStation(
    {
      input: {
        ...dispatchInput,
        agentId: "ag_implementer:reused",
        message: "Address review findings.",
      },
      station: "implementer",
    },
    {
      ctx: dispatchContext(2, deliver(secondTaskId, "station-turn-2", 2)),
      task: taskContext(secondTaskId),
      authorizations: bindings.authorizations,
    },
  );
  expect(await bindings.readCurrent({ ...dispatchInput, station: "implementer" })).toMatchObject({
    binding: { taskId: secondTaskId },
  });
  const replacement = { ...first, revision: 2 };
  expect(
    await tool.execute(
      { ...replacement, supersededTaskIds: ["task_aaaaaaaaaaaaaaaaaaaaaaaa"] },
      stationContext("station-turn-2"),
    ),
  ).toMatchObject({ saved: true });
  expect(await checkpoints.read(first)).toMatchObject({
    checkpoint: {
      stationRunId: "reused-station-session",
      supersededTaskIds: [firstTaskId],
      taskId: secondTaskId,
    },
    found: true,
  });
});
