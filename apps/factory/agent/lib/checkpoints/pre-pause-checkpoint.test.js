// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { createPrePauseCheckpoint } from "./pre-pause-checkpoint.js";
import { runtimeEvent, sessionLimitRequest } from "./runtime-event-fixtures.js";
import { createRuntimeEventHandler, createRuntimeObserver } from "./runtime-observer.js";
import { stationDeliveryMessage } from "./station-delivery.js";
import { createCheckpointStore } from "./store.js";
import { createTaskBindingStore } from "./task-binding.js";

const identity = {
  rootRunId: "wrun_root",
  station: /** @type {const} */ ("implementer"),
  taskId: "task_111111111111111111111111",
  workItem: "GuiBibeau/solos#55",
};

const context = /** @type {import("eve/hooks").HookContext} */ ({
  agent: { name: "implementer" },
  channel: {},
  session: {
    id: "station-run",
    parent: {
      callId: "dispatch",
      rootSessionId: "wrun_root",
      sessionId: "root-session",
      turn: { id: "root-turn", sequence: 1 },
    },
    turn: { id: "station-turn", sequence: 1 },
  },
});

const inspect = async () => ({
  dirty: true,
  dirtyFiles: ["apps/factory/agent/lib/checkpoints/runtime-observer.js"],
  head: "b".repeat(40),
  name: "codex/factory-station-checkpoints",
});

test("a session guardrail durably checkpoints the preserved checkout before pausing", async () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const bindings = createTaskBindingStore(memory.io);
  const prePause = createPrePauseCheckpoint({ bindings, checkpoints, inspect, observer });
  const handle = createRuntimeEventHandler(observer, bindings, prePause);
  await handle(
    runtimeEvent("message.received", 1, {
      message: stationDeliveryMessage(identity, "Continue issue #55."),
      sequence: 1,
      turnId: "station-turn",
    }),
    context,
  );
  await handle(runtimeEvent("input.requested", 2, { requests: [sessionLimitRequest()] }), context);

  expect(await checkpoints.read(identity)).toMatchObject({
    checkpoint: {
      branch: {
        dirty: true,
        dirtyFiles: ["apps/factory/agent/lib/checkpoints/runtime-observer.js"],
        head: "b".repeat(40),
        name: "codex/factory-station-checkpoints",
      },
      diagnostics: ["Budget guardrail reached before a station milestone."],
      outcome: "budget_paused",
      stationRunId: "station-run",
      taskId: identity.taskId,
      verification: { stage: "pre-pause-checkpoint", status: "blocked" },
    },
    found: true,
  });
});
