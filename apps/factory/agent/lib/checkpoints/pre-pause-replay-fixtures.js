// @ts-check
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { createPrePauseCheckpoint } from "./pre-pause-checkpoint.js";
import { runtimeEvent, sessionLimitRequest } from "./runtime-event-fixtures.js";
import { createRuntimeEventHandler, createRuntimeObserver } from "./runtime-observer.js";
import { stationDeliveryMessage } from "./station-delivery.js";
import { createCheckpointStore } from "./store.js";
import { createTaskBindingStore } from "./task-binding.js";

export const checkpointIdentity = {
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

/** @param {{message?: string; name: string; output?: Record<string, unknown>; sequence: number; status: "completed" | "failed"}} details */
const actionResult = ({ message = "check failed", name, output = {}, sequence, status }) =>
  runtimeEvent("action.result", sequence, {
    ...(status === "failed" && { error: { code: "CHECK_FAILED", message } }),
    result: {
      callId: `call-${sequence}`,
      isError: status === "failed",
      kind: "tool-result",
      output,
      toolName: name,
    },
    sequence,
    status,
    stepIndex: sequence,
    turnId: "station-turn",
  });

/** @param {(event: import("eve/hooks").HookEvent, ctx: import("eve/hooks").HookContext) => Promise<void>} handle */
const replayActions = (handle) => ({
  operate: (
    /** @type {number} */ sequence,
    /** @type {string} */ name,
    /** @type {"completed" | "failed"} */ status,
  ) => handle(actionResult({ name, sequence, status }), context),
  saveArtifact: (/** @type {number} */ sequence, /** @type {string} */ id) =>
    handle(
      actionResult({
        name: "save-artifact",
        output: { id, saved: true },
        sequence,
        status: "completed",
      }),
      context,
    ),
  verify: (/** @type {number} */ sequence, /** @type {"completed" | "failed"} */ status) =>
    handle(
      actionResult({
        message: "Verifier exited 1; token=https://secret.invalid/?key=hidden",
        name: "verify-station",
        output: { success: status === "completed" },
        sequence,
        status,
      }),
      context,
    ),
  pause: (/** @type {number} */ sequence) =>
    handle(
      runtimeEvent("input.requested", sequence, { requests: [sessionLimitRequest()] }),
      context,
    ),
});

export const createPrePauseReplay = () => {
  const memory = createCheckpointMemoryIo();
  const checkpoints = createCheckpointStore(memory.io);
  const observer = createRuntimeObserver(memory.io);
  const bindings = createTaskBindingStore(memory.io);
  const prePause = createPrePauseCheckpoint({ bindings, checkpoints, inspect, observer });
  const handle = createRuntimeEventHandler(observer, bindings, prePause);
  return {
    ...replayActions(handle),
    checkpoints,
    deliver: async () => {
      await bindings.authorizations.authorize(checkpointIdentity);
      return handle(
        runtimeEvent("message.received", 1, {
          message: stationDeliveryMessage(checkpointIdentity, "Continue issue #55."),
          sequence: 1,
          turnId: "station-turn",
        }),
        context,
      );
    },
  };
};
