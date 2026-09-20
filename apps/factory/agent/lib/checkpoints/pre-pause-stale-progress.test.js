// @ts-check
import { expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { checkpointIdentity, createPrePauseReplay } from "./pre-pause-replay-fixtures.js";

test("a newer runtime operation replaces stale progress without losing handoff facts", async () => {
  const replay = createPrePauseReplay();
  const stale = {
    ...issue18Checkpoint,
    artifactIds: ["analysis-55"],
    latestOperation: {
      at: "2026-09-19T00:00:00.000Z",
      name: "old-check",
      status: /** @type {const} */ ("failed"),
    },
    revision: 1,
    rootRunId: checkpointIdentity.rootRunId,
    station: checkpointIdentity.station,
    stationRunId: "station-run",
    taskId: checkpointIdentity.taskId,
    updatedAt: "2026-09-19T00:00:00.000Z",
    workItem: checkpointIdentity.workItem,
  };
  expect(await replay.checkpoints.save(stale)).toMatchObject({ saved: true });
  await replay.deliver();
  await replay.verify(2, "completed");
  await replay.pause(3);

  expect(await replay.checkpoints.read(checkpointIdentity)).toMatchObject({
    checkpoint: {
      artifactIds: ["analysis-55"],
      blocker: stale.blocker,
      branch: {
        base: "main",
        dirty: true,
        head: "b".repeat(40),
        name: "codex/factory-station-checkpoints",
      },
      diagnostics: stale.diagnostics,
      latestOperation: { name: "verify-station", status: "passed" },
      nextMilestone: "Continue from completed verify-station on the preserved checkout.",
      revision: 2,
      verification: { stage: "verify-station", status: "passed" },
    },
    found: true,
  });
});
