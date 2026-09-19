// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointSaver } from "./checkpoint-saver.js";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";
import { createCheckpointStore } from "./store.js";

const reusedSessionContext = () =>
  /** @type {import("eve/tools").SessionContext} */ ({
    session: {
      id: "reused-station-session",
      parent: {
        callId: "original-creation-call",
        rootSessionId: "root-session",
        sessionId: "parent-session",
        turn: { id: "original-parent-turn", sequence: 0 },
      },
      turn: { id: "current-station-turn", sequence: 2 },
    },
  });

test("a reused station session transfers checkpoint ownership to its second task", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const save = createCheckpointSaver(checkpoints, createRuntimeObserver(memory.io));
  const firstTaskId = "task_111111111111111111111111";
  const secondTaskId = "task_222222222222222222222222";
  const first = { ...issue18Checkpoint, revision: 1, taskId: firstTaskId };
  expect(await save(first, reusedSessionContext())).toMatchObject({ saved: true });

  const replacement = { ...first, revision: 2, taskId: secondTaskId };
  expect(await save(replacement, reusedSessionContext())).toMatchObject({ saved: false });
  expect(
    await save({ ...replacement, supersededTaskIds: [firstTaskId] }, reusedSessionContext()),
  ).toMatchObject({ saved: true });
  expect(await checkpoints.read(first)).toMatchObject({
    checkpoint: { stationRunId: "reused-station-session", taskId: secondTaskId },
    found: true,
  });
});
