// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointSaver } from "./checkpoint-saver.js";
import { issue18Checkpoint } from "./fixtures.js";

test("save takes continuation cursors only from runtime observation", async () => {
  /** @type {unknown[]} */
  const writes = [];
  const checkpoints = {
    read: async () => ({ found: /** @type {const} */ (false) }),
    save: async (candidate) => {
      writes.push(candidate);
      return { saved: true };
    },
  };
  const observer = {
    read: async () => ({
      found: /** @type {const} */ (true),
      observation: {
        cursor: "runtime-cursor",
        latestActivityAt: "2026-09-19T04:00:00.000Z",
        revision: 1,
        seenEventIds: [],
        sessionStatus: /** @type {const} */ ("waiting"),
        stationRunId: "station-run",
      },
    }),
  };
  const bindings = {
    read: async () => ({
      binding: {
        rootRunId: issue18Checkpoint.rootRunId,
        station: issue18Checkpoint.station,
        taskId: issue18Checkpoint.taskId,
        workItem: issue18Checkpoint.workItem,
      },
      found: /** @type {const} */ (true),
    }),
  };
  const save = createCheckpointSaver(checkpoints, observer, bindings);
  await save(
    {
      ...issue18Checkpoint,
      cursor: "model-invented",
      revision: 99,
      updatedAt: "2099-01-01T00:00:00.000Z",
    },
    /** @type {import("eve/tools").SessionContext} */ ({
      session: { id: "station-run", turn: { id: "turn-1", sequence: 1 } },
    }),
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ cursor: "runtime-cursor", revision: 1 });
  expect(writes[0]).not.toMatchObject({ updatedAt: "2099-01-01T00:00:00.000Z" });
});
