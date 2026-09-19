// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { checkpointKey } from "./config.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createCheckpointStore } from "./store.js";

test("checkpoint survives restart and rejects an older delayed save", async () => {
  const memory = createCheckpointMemoryIo();
  const firstProcess = createCheckpointStore(memory.io);
  const initial = { ...issue18Checkpoint, outcome: /** @type {const} */ ("active"), revision: 1 };
  expect(await firstProcess.save(initial)).toMatchObject({ saved: true });

  const restartedProcess = createCheckpointStore(memory.io);
  expect(await restartedProcess.read(initial)).toMatchObject({
    checkpoint: { branch: initial.branch, diagnostics: initial.diagnostics, revision: 1 },
    found: true,
  });

  const current = { ...initial, nextMilestone: "Run focused typecheck.", revision: 2 };
  expect(await restartedProcess.save(current)).toMatchObject({ saved: true });
  expect(await firstProcess.save(initial)).toMatchObject({ saved: false });
  expect(await restartedProcess.read(initial)).toMatchObject({
    checkpoint: { nextMilestone: "Run focused typecheck.", revision: 2 },
    found: true,
  });
});

test("checkpoint read fails closed on malformed stored content", async () => {
  const memory = createCheckpointMemoryIo();
  const key = checkpointKey(
    issue18Checkpoint.workItem,
    issue18Checkpoint.rootRunId,
    issue18Checkpoint.station,
  );
  if (key === null) throw new Error("fixture key must be valid");
  memory.corrupt(key);
  expect(await createCheckpointStore(memory.io).read(issue18Checkpoint)).toMatchObject({
    found: false,
  });
});

test("checkpoint save preserves a queued escalation for the same blocker", async () => {
  const memory = createCheckpointMemoryIo();
  const store = createCheckpointStore(memory.io);
  const escalation = {
    deliveryKey: "solos-station-escalation:esc_1234567890abcdef12345678",
    id: "esc_1234567890abcdef12345678",
    message: "Implementer remains blocked.",
    queuedAt: "2026-09-19T03:45:00.000Z",
  };
  const initial = {
    ...issue18Checkpoint,
    blocker: { ...issue18Checkpoint.blocker, escalation },
    revision: 1,
  };
  expect(await store.save(initial)).toMatchObject({ saved: true });
  const update = { ...issue18Checkpoint, revision: 2 };
  expect(await store.save(update)).toMatchObject({ saved: true });
  expect(await store.read(update)).toMatchObject({
    checkpoint: { blocker: { escalation }, revision: 2 },
    found: true,
  });
});
