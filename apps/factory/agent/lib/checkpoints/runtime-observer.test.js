// @ts-check
import { expect, test } from "bun:test";
import { createCheckpointMemoryIo } from "./checkpoint-test-io.js";
import { runtimeEvent, sessionLimitRequest, waitingEvent } from "./runtime-event-fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";

test("budget input remains paused across Eve's completed and waiting boundaries", async () => {
  const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
  await observer.observe(runtimeEvent("turn.started", 1), "station-run");
  await observer.observe(
    runtimeEvent("input.requested", 2, { requests: [sessionLimitRequest()] }),
    "station-run",
  );
  await observer.observe(runtimeEvent("turn.completed", 3), "station-run");
  await observer.observe(waitingEvent(4), "station-run");
  expect(await observer.read("station-run")).toMatchObject({
    observation: {
      pendingInput: "session_limit",
      sessionStatus: "waiting",
      taskOutcome: "budget_paused",
    },
  });
});

test("approved budget input returns the station to active", async () => {
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
      ],
    }),
    "run",
  );
  const stored = await observer.read("run");
  expect(stored).toMatchObject({ observation: { taskOutcome: "active" } });
  if (!stored.found) throw new Error("observation missing");
  expect(stored.observation).not.toHaveProperty("pendingInput");
});

test("ignored budget input stays pending until explicit continue", async () => {
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
          outcome: "ignored",
          requestId: "limit-1",
          response: null,
        },
      ],
    }),
    "run",
  );
  await observer.observe(runtimeEvent("turn.started", 3), "run");
  expect(await observer.read("run")).toMatchObject({
    observation: {
      pendingInput: "session_limit",
      taskOutcome: "budget_paused",
    },
  });
});

const rejectedContinuations = [
  {
    kind: "question",
    outcome: "answered",
    requestId: "question-1",
    response: { optionId: "continue", requestId: "question-1" },
  },
  {
    kind: "session-limit",
    outcome: "answered",
    requestId: "different-limit",
    response: { optionId: "continue", requestId: "different-limit" },
  },
  {
    kind: "session-limit",
    outcome: "answered",
    requestId: "limit-1",
    response: { optionId: "continue", requestId: "different-limit" },
  },
  ...["denied", "ignored", "invalid"].map((outcome) => ({
    kind: "session-limit",
    outcome,
    requestId: "limit-1",
    response: { optionId: "continue", requestId: "limit-1" },
  })),
];

test("unrelated, mismatched, and unsuccessful resolutions cannot continue a budget pause", async () => {
  for (const [index, resolution] of rejectedContinuations.entries()) {
    const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
    await observer.observe(
      runtimeEvent("input.requested", 1, { requests: [sessionLimitRequest()] }),
      `run-${index}`,
    );
    await observer.observe(
      runtimeEvent("input.resolved", 2, {
        resolutions: [
          resolution,
          { kind: "question", outcome: "answered", requestId: "other-question" },
        ],
      }),
      `run-${index}`,
    );
    expect(await observer.read(`run-${index}`)).toMatchObject({
      observation: {
        pendingInput: "session_limit",
        pendingSessionLimitRequests: ["limit-1"],
        taskOutcome: "budget_paused",
      },
    });
  }
});

test("ordinary completed turns retain Eve's continuation cursor", async () => {
  const observer = createRuntimeObserver(createCheckpointMemoryIo().io);
  await observer.observe(runtimeEvent("session.started", 1), "station-run");
  await observer.observe(runtimeEvent("turn.completed", 2), "station-run");
  await observer.observe(waitingEvent(), "station-run");
  expect(await observer.read("station-run")).toMatchObject({
    observation: {
      cursor: "resume-here",
      sessionStatus: "waiting",
      taskOutcome: "completed",
    },
  });
});
