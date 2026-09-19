// @ts-check
import { readDocument, writeDocument } from "../blob.js";
import { observationKey } from "./config.js";
import { observationFromEvent, RuntimeObservationSchema } from "./runtime-observation.js";

/** @typedef {import("./runtime-observation.js").RuntimeObservation} RuntimeObservation */
/** @typedef {{
 * read: (key: string) => Promise<{found: false} | {content: string; etag: string; found: true; uploadedAt: string}>;
 * write: (key: string, contents: string, options: {allowOverwrite: boolean; contentType?: string; ifMatch?: string}) => Promise<unknown>;
 * }} ObservationIo */

/** @param {ObservationIo} io @param {RuntimeObservation} observation */
const persist = async (io, observation) => {
  const key = observationKey(observation.stationRunId);
  if (key === null) return;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await io.read(key);
    if (current.found) {
      const prior = RuntimeObservationSchema.parse(JSON.parse(current.content));
      if (isCurrentOrNewer(prior, observation)) return;
    }
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

/** @param {RuntimeObservation} prior @param {RuntimeObservation} incoming */
const isCurrentOrNewer = (prior, incoming) =>
  prior.latestActivityAt > incoming.latestActivityAt ||
  (prior.latestActivityAt === incoming.latestActivityAt && prior.cursor >= incoming.cursor);

/** @param {ObservationIo} io @param {string} stationRunId */
const read = async (io, stationRunId) => {
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

/** @param {ObservationIo} io */
export const createRuntimeObserver = (io) => {
  /** @param {import("eve/hooks").HookEvent} event @param {string} stationRunId */
  const observe = async (event, stationRunId) => {
    const observation = observationFromEvent(event, stationRunId);
    if (observation !== null) await persist(io, observation);
  };
  return { observe, read: (/** @type {string} */ stationRunId) => read(io, stationRunId) };
};

export const runtimeObserver = createRuntimeObserver({ read: readDocument, write: writeDocument });

/** Runtime observation must never make the station's durable work fail. */
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
