// @ts-check
import { expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { checkpointIdentity, createPrePauseReplay } from "./pre-pause-replay-fixtures.js";

const authoredCheckpoint = {
  ...issue18Checkpoint,
  latestOperation: {
    at: "2026-09-19T00:00:02.000Z",
    name: "verify-station",
    status: /** @type {const} */ ("passed"),
  },
  nextMilestone: "Implement the remaining checkpoint reader acceptance case.",
  revision: 1,
  rootRunId: checkpointIdentity.rootRunId,
  station: checkpointIdentity.station,
  stationRunId: "station-run",
  taskId: checkpointIdentity.taskId,
  updatedAt: "2026-09-19T00:00:03.000Z",
  verification: { stage: "verify-station", status: /** @type {const} */ ("passed") },
  workItem: checkpointIdentity.workItem,
};

test("checkpoint save does not replace authored progress before a guardrail", async () => {
  const replay = createPrePauseReplay();
  await replay.deliver();
  await replay.verify(2, "completed");
  expect(await replay.checkpoints.save(authoredCheckpoint)).toMatchObject({ saved: true });
  await replay.operate(4, "save-station-checkpoint", "completed");
  await replay.pause(5);
  expect(await replay.checkpoints.read(checkpointIdentity)).toMatchObject({
    checkpoint: {
      latestOperation: authoredCheckpoint.latestOperation,
      nextMilestone: authoredCheckpoint.nextMilestone,
      verification: authoredCheckpoint.verification,
    },
  });
});

test("new artifacts and bounded failed verification details survive a guardrail", async () => {
  const replay = createPrePauseReplay();
  await replay.deliver();
  expect(
    await replay.checkpoints.save({
      ...authoredCheckpoint,
      artifactIds: ["analysis-earlier-111aaa"],
      diagnostics: ["Earlier unresolved dependency."],
      latestOperation: { ...authoredCheckpoint.latestOperation, at: "2026-09-19T00:00:01.000Z" },
      updatedAt: "2026-09-19T00:00:01.500Z",
    }),
  ).toMatchObject({ saved: true });
  await replay.saveArtifact(2, "analysis-checkpoint-replay-123abc");
  await replay.verify(3, "failed");
  await replay.pause(4);
  const stored = await replay.checkpoints.read(checkpointIdentity);
  expect(stored).toMatchObject({
    checkpoint: {
      artifactIds: ["analysis-earlier-111aaa", "analysis-checkpoint-replay-123abc"],
      diagnostics: [
        "Earlier unresolved dependency.",
        expect.stringContaining("Verifier exited 1; token=[redacted]"),
      ],
      latestOperation: { name: "verify-station", status: "failed" },
    },
  });
  expect(JSON.stringify(stored)).not.toContain("secret.invalid");
});

test("checkout is neither domain progress nor verification", async () => {
  const replay = createPrePauseReplay();
  await replay.deliver();
  await replay.operate(2, "checkout-branch", "completed");
  await replay.pause(3);
  expect(await replay.checkpoints.read(checkpointIdentity)).toMatchObject({
    checkpoint: {
      latestOperation: { name: "session-limit guardrail request" },
      verification: { stage: "no-verification-before-guardrail", status: "not_started" },
    },
  });
});
