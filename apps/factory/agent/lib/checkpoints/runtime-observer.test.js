// @ts-check
import { describe, expect, test } from "bun:test";
import { issue18Checkpoint } from "./fixtures.js";
import { createRuntimeObserver } from "./runtime-observer.js";
import { stationView } from "./status.js";
import { createCheckpointStore } from "./store.js";
import { createCheckpointReader } from "./tools.js";

const memoryIo = () => {
  /** @type {Map<string, {content: string; etag: string}>} */
  const documents = new Map();
  let version = 0;
  return {
    read: async (/** @type {string} */ key) => {
      const value = documents.get(key);
      return value === undefined
        ? { found: /** @type {const} */ (false) }
        : {
            content: value.content,
            etag: value.etag,
            found: /** @type {const} */ (true),
            uploadedAt: "2026-09-19T00:00:00.000Z",
          };
    },
    write: async (
      /** @type {string} */ key,
      /** @type {string} */ content,
      /** @type {{allowOverwrite: boolean; ifMatch?: string}} */ options,
    ) => {
      const current = documents.get(key);
      if (current !== undefined && !options.allowOverwrite) throw new Error("exists");
      if (options.ifMatch !== undefined && options.ifMatch !== current?.etag)
        throw new Error("conflict");
      version += 1;
      documents.set(key, { content, etag: `etag-${version}` });
    },
  };
};

/** @param {string} type @param {number} sequence @param {Record<string, unknown>} [data] */
const event = (type, sequence, data = {}) =>
  /** @type {import("eve/hooks").HookEvent} */ ({
    data,
    meta: { at: `2026-09-19T00:00:0${sequence}.000Z`, id: `event-${sequence}` },
    type,
  });

describe("runtime-owned station observation replay", () => {
  test("replays a parked child completion and returned continuation cursor", async () => {
    const observer = createRuntimeObserver(memoryIo());
    await observer.observe(event("session.started", 1), "station-run");
    await observer.observe(event("turn.completed", 2), "station-run");
    await observer.observe(
      event("session.waiting", 3, { continuationToken: "resume-here", wait: "next-user-message" }),
      "station-run",
    );
    expect(await observer.read("station-run")).toMatchObject({
      found: true,
      observation: {
        cursor: "resume-here",
        revision: 3,
        sessionStatus: "waiting",
        taskOutcome: "completed",
      },
    });
  });

  test("joins activity by the checkpoint's stored run id", async () => {
    const io = memoryIo();
    const checkpoints = createCheckpointStore(io);
    const observer = createRuntimeObserver(io);
    const checkpoint = {
      ...issue18Checkpoint,
      outcome: /** @type {const} */ ("active"),
      revision: 1,
      stationRunId: "stored-station-run",
    };
    await checkpoints.save(checkpoint);
    await observer.observe(event("session.completed", 1), "stored-station-run");
    const read = createCheckpointReader(checkpoints, observer);

    expect(await read(checkpoint)).toMatchObject({
      found: true,
      view: { cursor: "trace-page-4", redispatch: false, status: "completed" },
    });
  });

  test("uses ingestion revision and deduplicates provider usage", async () => {
    const observer = createRuntimeObserver(memoryIo());
    const started = event("turn.started", 1);
    const usage = event("step.completed", 2, {
      finishReason: "stop",
      sequence: 2,
      stepIndex: 0,
      turnId: "turn-1",
      usage: { cacheReadTokens: 3, costUsd: 0.01, inputTokens: 10, outputTokens: 2 },
    });
    const priorClock = "2026-09-18T23:59:59.000Z";
    const completion = event("turn.completed", 3);
    const completed = { ...completion, meta: { ...completion.meta, at: priorClock } };
    await observer.observe(started, "station-run");
    await observer.observe(usage, "station-run");
    await observer.observe(usage, "station-run");
    await observer.observe(completed, "station-run");
    expect(await observer.read("station-run")).toMatchObject({
      observation: {
        revision: 3,
        taskOutcome: "completed",
        usage: { billedCostUsd: 0.01, cachedInputTokens: 3, inputTokens: 10, outputTokens: 2 },
      },
    });
  });

  test("replays completed, replacement, slow, failed, cancelled, and timeout states", async () => {
    /** @type {Array<[import("eve/hooks").HookEvent["type"], "active" | "completed" | "failed"]>} */
    const cases = [
      ["session.completed", "completed"],
      ["turn.started", "active"],
      ["actions.requested", "active"],
      ["session.failed", "failed"],
      ["turn.cancelled", "failed"],
    ];
    for (const [type, expected] of cases) {
      const observer = createRuntimeObserver(memoryIo());
      await observer.observe(event(type, 1), `run-${type}`);
      if (type === "turn.cancelled")
        await observer.observe(
          event("session.waiting", 2, { continuationToken: "resume", wait: "next-user-message" }),
          `run-${type}`,
        );
      const stored = await observer.read(`run-${type}`);
      if (!stored.found || stored.observation === undefined) throw new Error("observation missing");
      expect(
        stationView(
          { ...issue18Checkpoint, outcome: type === "turn.started" ? "superseded" : "active" },
          stored.observation,
        ).status,
      ).toBe(expected);
    }
    expect(
      stationView({ ...issue18Checkpoint, outcome: "active" }, { observationTimedOut: true })
        .status,
    ).toBe("unknown");
  });
});
