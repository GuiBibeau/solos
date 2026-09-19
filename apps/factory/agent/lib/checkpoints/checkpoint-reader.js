// @ts-check
import { blockerStatus, monitoringBackoffMs, reportUsage, stationView } from "./status.js";

/** @param {import("./schema.js").StationCheckpoint} checkpoint @param {RuntimeRead} observed */
const withObservedUsage = (checkpoint, observed) => {
  const usage = observed.found ? observed.observation?.usage : undefined;
  return usage === undefined ? checkpoint : { ...checkpoint, usage };
};

/** @param {import("eve/tools").SessionContext | undefined} ctx */
const rootSessionId = (ctx) => ctx?.session.parent?.rootSessionId ?? ctx?.session.id;

/** @param {RuntimeObserver} observer @param {import("eve/tools").SessionContext | undefined} ctx */
const readRootObservation = async (observer, ctx) => {
  const sessionId = rootSessionId(ctx);
  return sessionId === undefined
    ? { found: /** @type {const} */ (false) }
    : observer.read(sessionId);
};

/** @param {RuntimeRead} observed */
const stationObservation = (observed) =>
  observed.found
    ? (observed.observation ?? { observationTimedOut: /** @type {const} */ (true) })
    : { observationTimedOut: /** @type {const} */ (true) };

/** @param {import("./schema.js").StationCheckpoint} stored @param {{root: RuntimeRead; station: RuntimeRead}} observations @param {number} unchangedObservations */
const joinedResult = (stored, observations, unchangedObservations) => {
  const checkpoint = withObservedUsage(stored, observations.station);
  const rootUsage = observations.root.found ? observations.root.observation?.usage : undefined;
  const usage = reportUsage([rootUsage, checkpoint.usage]);
  return {
    checkpoint,
    backoffMs: monitoringBackoffMs(unchangedObservations),
    blocker: blockerStatus(checkpoint),
    found: true,
    ...(usage !== undefined && { usage }),
    view: stationView(checkpoint, stationObservation(observations.station)),
  };
};

/** @param {CheckpointStore} checkpoints @param {RuntimeObserver} observer */
export const createCheckpointReader =
  (checkpoints, observer) =>
  async (
    /** @type {{rootRunId: string; station: string; unchangedObservations?: number; workItem: string}} */ input,
    /** @type {import("eve/tools").SessionContext | undefined} */ ctx,
  ) => {
    const { workItem, rootRunId, station, unchangedObservations = 0 } = input;
    const result = await checkpoints.read({ rootRunId, station, workItem });
    const stored = result.checkpoint;
    if (stored === undefined || !result.found) return result;
    const observed =
      stored.stationRunId === undefined
        ? { found: /** @type {const} */ (false) }
        : await observer.read(stored.stationRunId);
    const rootObserved = await readRootObservation(observer, ctx);
    return joinedResult(stored, { root: rootObserved, station: observed }, unchangedObservations);
  };

/** @typedef {{read: (input: {rootRunId: string; station: string; workItem: string}) => Promise<{checkpoint?: import("./schema.js").StationCheckpoint; found: boolean}>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<RuntimeRead>}} RuntimeObserver */
/** @typedef {{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}} RuntimeRead */
