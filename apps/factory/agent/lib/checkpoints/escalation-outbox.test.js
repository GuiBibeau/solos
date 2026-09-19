// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { createEscalationOutbox } from "./escalation-outbox.js";
import { issue18Checkpoint } from "./fixtures.js";
import { createCheckpointStore } from "./store.js";

const escalationInput = {
  fingerprint: issue18Checkpoint.blocker?.fingerprint ?? "missing",
  rootRunId: issue18Checkpoint.rootRunId,
  station: issue18Checkpoint.station,
  workItem: issue18Checkpoint.workItem,
};

const seededOutbox = async () => {
  const memory = createCheckpointMemoryIo();
  await createCheckpointStore(memory.io).save({ ...issue18Checkpoint, revision: 1 });
  return { memory, outbox: createEscalationOutbox(memory.io) };
};

test("concurrent enqueue calls converge on one durable delivery key", async () => {
  const { memory, outbox } = await seededOutbox();
  const [first, second] = await Promise.all([
    outbox.enqueue(escalationInput),
    createEscalationOutbox(memory.io).enqueue(escalationInput),
  ]);
  expect(first).toMatchObject({ delivery: "pending", escalationId: expect.any(String) });
  expect(second).toEqual(first);
  expect(await createEscalationOutbox(memory.io).enqueue(escalationInput)).toEqual(first);
  expect(await outbox.enqueue({ ...escalationInput, fingerprint: "new-blocker" })).toEqual({
    delivery: "ineligible",
    reason: "blocker_changed",
  });
});

test("enqueue recovers when the write commits but its response is lost", async () => {
  const { memory, outbox } = await seededOutbox();
  memory.failAfterNextWrite();
  const result = await outbox.enqueue(escalationInput);
  expect(result).toMatchObject({
    delivery: "pending",
    deliveryKey: expect.stringContaining("solos-station-escalation:esc_"),
    escalation: expect.stringContaining("remains blocked"),
  });
  const stored = await createCheckpointStore(memory.io).read(issue18Checkpoint);
  expect(stored).toMatchObject({
    checkpoint: { blocker: { escalation: { id: result.escalationId } } },
    found: true,
  });
});

test("acknowledgement is durable and retry safe after an ambiguous commit", async () => {
  const { memory, outbox } = await seededOutbox();
  const queued = await outbox.enqueue(escalationInput);
  if (queued.escalationId === undefined) throw new Error("expected queued escalation");
  memory.failAfterNextWrite();
  expect(
    await outbox.acknowledge({ ...escalationInput, escalationId: queued.escalationId }),
  ).toMatchObject({ acknowledged: true, delivery: "delivered" });
  expect(await outbox.enqueue(escalationInput)).toMatchObject({
    delivery: "delivered",
    escalationId: queued.escalationId,
  });
});
