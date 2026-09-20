// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { runtimeEvent, sessionLimitRequest } from "./runtime-event-fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";

test("a valid continuation mixed with any extra resolution remains paused", async () => {
  const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
  await observer.observe(
    runtimeEvent("input.requested", 1, { requests: [sessionLimitRequest()] }),
    "run",
  );
  await observer.observe(
    runtimeEvent("input.resolved", 2, {
      resolutions: [
        {
          kind: "session-limit",
          outcome: "answered",
          requestId: "limit-1",
          response: { optionId: "continue", requestId: "limit-1" },
        },
        { kind: "question", outcome: "ignored", requestId: "extra", response: null },
      ],
    }),
    "run",
  );
  expect(await observer.read("run")).toMatchObject({
    observation: {
      pendingInput: "session_limit",
      pendingSessionLimitRequests: ["limit-1"],
      taskOutcome: "budget_paused",
    },
  });
});
