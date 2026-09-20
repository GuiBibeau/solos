// @ts-check
import { readDocument, writeDocument } from "../blob.js";
import { observationKey } from "./config.js";
import { createPrePauseCheckpoint } from "./pre-pause-checkpoint.js";
import { mergeLifecycle } from "./runtime-lifecycle.js";
import { observationFromEvent, RuntimeObservationSchema } from "./runtime-observation.js";
import { mergeRuntimeProgress } from "./runtime-progress.js";
import { addUsage } from "./runtime-usage.js";
import { checkpointStore } from "./store.js";
import { taskBindingStore } from "./task-binding.js";

/** @typedef {import("./runtime-observation.js").RuntimeObservation} RuntimeObservation */
/** @typedef {{
 * read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true; uploadedAt: string}>;
 * write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>;
 * }} ObservationIo */

/** @param {ObservationIo} io @param {NonNullable<ReturnType<typeof observationFromEvent>>} event */
const persist = async (io, event) => {
  const key = observationKey(event.stationRunId);
  if (key === null) return;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await io.read(key);
    const prior = current.found
      ? RuntimeObservationSchema.parse(JSON.parse(current.content))
      : undefined;
    const observation = mergeObservation(prior, event);
    if (observation === null) return;
    try {
      await io.write(key, JSON.stringify(observation), {
        allowOverwrite: current.found,
        contentType: "application/json",
        ...(current.found && { ifMatch: current.etag }),
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

/** @param {RuntimeObservation | undefined} prior @param {NonNullable<ReturnType<typeof observationFromEvent>>} event */
const mergeObservation = (prior, event) => {
  const previous =
    prior ??
    /** @type {Pick<RuntimeObservation, "cursor" | "progress" | "revision" | "seenEventIds" | "taskOutcome" | "usage">} */ ({
      revision: 0,
      seenEventIds: [],
    });
  if (
    previous.seenEventIds.includes(event.eventId) ||
    (prior?.lastEventId !== undefined && event.eventId <= prior.lastEventId)
  )
    return null;
  const lifecycle = mergeLifecycle(previous, event);
  return RuntimeObservationSchema.parse({
    cursor: event.cursor ?? previous.cursor,
    lastEventId: event.eventId,
    latestActivityAt: event.latestActivityAt,
    ...lifecycle,
    progress: mergeRuntimeProgress(previous.progress, event.progressFact),
    revision: previous.revision + 1,
    seenEventIds: [...previous.seenEventIds, event.eventId].slice(-100),
    stationRunId: event.stationRunId,
    usage: addUsage(previous.usage, event.usage),
  });
};

/** @param {ObservationIo} io */
export const createRuntimeObserver = (io) => {
  /** @param {import("eve/hooks").HookEvent} event @param {string} stationRunId @param {"station" | "root_aggregate"} [accountingScope] */
  const observe = async (event, stationRunId, accountingScope = "station") => {
    const observation = observationFromEvent(event, stationRunId, accountingScope);
    if (observation !== null) await persist(io, observation);
  };
  const read = async (/** @type {string} */ stationRunId) => {
    const key = observationKey(stationRunId);
    if (key === null) return { found: false };
    try {
      const document = await io.read(key);
      if (!document.found) return { found: false };
      return {
        found: true,
        observation: RuntimeObservationSchema.parse(JSON.parse(document.content)),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Observation read failed.",
        found: false,
      };
    }
  };
  return { observe, read };
};

export const runtimeObserver = createRuntimeObserver({
  read: readDocument,
  write: writeDocument,
});

const noPrePauseCheckpoint = async () => {};

/** @param {Pick<typeof runtimeObserver, "observe">} observer @param {Pick<typeof taskBindingStore, "observe">} [bindings] @param {(event: import("eve/hooks").HookEvent, ctx: import("eve/hooks").HookContext) => Promise<void>} [prePause] */
export const createRuntimeEventHandler =
  (observer, bindings = taskBindingStore, prePause = noPrePauseCheckpoint) =>
  /** @param {import("eve/hooks").HookEvent} event @param {import("eve/hooks").HookContext} ctx */
  async (event, ctx) => {
    await bindings.observe(event, ctx);
    await prePause(event, ctx);
    await observer.observe(
      event,
      ctx.session.id,
      ctx.session.parent === undefined ? "root_aggregate" : "station",
    );
  };

const prePauseCheckpoint = createPrePauseCheckpoint({
  bindings: taskBindingStore,
  checkpoints: checkpointStore,
  observer: runtimeObserver,
});

export const observeRuntimeEvent = createRuntimeEventHandler(
  runtimeObserver,
  taskBindingStore,
  prePauseCheckpoint,
);
