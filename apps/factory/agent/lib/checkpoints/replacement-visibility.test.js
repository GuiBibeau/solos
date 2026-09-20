// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointReader } from "./checkpoint-reader.js";
import { issue18Checkpoint } from "./fixtures.js";

test("a durable current-task binding reveals an active replacement before its first save", async () => {
  const checkpoints = {
    read: async () => ({ checkpoint: issue18Checkpoint, found: true }),
  };
  const observer = {
    read: async () => ({
      found: true,
      observation: {
        latestActivityAt: "2099-09-19T00:00:02.000Z",
        revision: 1,
        seenEventIds: ["event-2"],
        sessionStatus: /** @type {const} */ ("running"),
        stationRunId: "replacement-run",
        taskOutcome: /** @type {const} */ ("active"),
      },
    }),
  };
  const bindings = {
    readCurrent: async () => ({
      binding: {
        receivedAt: "2099-09-19T00:00:02.000Z",
        stationRunId: "replacement-run",
        taskId: "task_222222222222222222222222",
      },
      found: /** @type {const} */ (true),
    }),
  };
  const read = createCheckpointReader(checkpoints, observer, bindings);
  expect(await read(issue18Checkpoint)).toMatchObject({
    checkpoint: { taskId: issue18Checkpoint.taskId },
    view: {
      redispatch: false,
      stationRunId: "replacement-run",
      status: "active",
      taskId: "task_222222222222222222222222",
    },
  });
});
