// @ts-check
import { readDocument, writeDocument } from "../blob.js";
import { observationKey } from "./config.js";
import { observationFromEvent, RuntimeObservationSchema } from "./runtime-observation.js";

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
    /** @type {Pick<RuntimeObservation, "cursor" | "revision" | "seenEventIds" | "taskOutcome" | "usage">} */ ({
      revision: 0,
      seenEventIds: [],
    });
  if (previous.seenEventIds.includes(event.eventId)) return null;
  return RuntimeObservationSchema.parse({
    cursor: event.cursor ?? previous.cursor,
    latestActivityAt: event.latestActivityAt,
    revision: previous.revision + 1,
    seenEventIds: [...previous.seenEventIds, event.eventId].slice(-100),
    sessionStatus: event.sessionStatus,
    stationRunId: event.stationRunId,
    taskOutcome: event.taskOutcome ?? previous.taskOutcome,
    usage: addUsage(previous.usage, event.usage),
  });
};

/** @param {RuntimeObservation["usage"]} prior @param {RuntimeObservation["usage"]} delta */
const addUsage = (prior, delta) => {
  if (delta === undefined) return prior;
  /** @param {number | undefined} left @param {number | undefined} right */
  const add = (left, right) =>
    left === undefined && right === undefined ? undefined : (left ?? 0) + (right ?? 0);
  return {
    accountingScope: /** @type {const} */ ("station"),
    ...(delta.billedCostSource !== undefined && { billedCostSource: delta.billedCostSource }),
    billedCostUsd: add(prior?.billedCostUsd, delta.billedCostUsd),
    cachedInputTokens: add(prior?.cachedInputTokens, delta.cachedInputTokens),
    inputTokens: add(prior?.inputTokens, delta.inputTokens),
    outputTokens: add(prior?.outputTokens, delta.outputTokens),
  };
};

/** @param {ObservationIo} io */
export const createRuntimeObserver = (io) => {
  /** @param {import("eve/hooks").HookEvent} event @param {string} stationRunId */
  const observe = async (event, stationRunId) => {
    const observation = observationFromEvent(event, stationRunId);
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

export const runtimeObserver = createRuntimeObserver({ read: readDocument, write: writeDocument });

/** @param {import("eve/hooks").HookEvent} event @param {import("eve/hooks").HookContext} ctx */
export const observeRuntimeEvent = async (event, ctx) => {
  try {
    await runtimeObserver.observe(event, ctx.session.id);
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        event: "station-observation-failed",
      }),
    );
  }
};
