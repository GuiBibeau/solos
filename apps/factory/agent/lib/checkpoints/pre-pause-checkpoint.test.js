// @ts-check
import { expect, test } from "bun:test";
import { checkpointIdentity, createPrePauseReplay } from "./pre-pause-replay-fixtures.js";

test("a session guardrail durably checkpoints the preserved checkout before pausing", async () => {
  const replay = createPrePauseReplay();
  await replay.deliver();
  await replay.verify(2, "failed");
  await replay.pause(3);

  expect(await replay.checkpoints.read(checkpointIdentity)).toMatchObject({
    checkpoint: {
      branch: {
        dirty: true,
        dirtyFiles: ["apps/factory/agent/lib/checkpoints/runtime-observer.js"],
        head: "b".repeat(40),
        name: "codex/factory-station-checkpoints",
      },
      diagnostics: [
        "verify-station failed (CHECK_FAILED): Verifier exited 1; token=[redacted] at 2026-09-19T00:00:02.000Z",
      ],
      latestOperation: { name: "verify-station", status: "failed" },
      nextMilestone: "Correct verify-station, then rerun it on the preserved checkout.",
      outcome: "budget_paused",
      stationRunId: "station-run",
      taskId: checkpointIdentity.taskId,
      verification: { stage: "verify-station", status: "failed" },
    },
    found: true,
  });
});
