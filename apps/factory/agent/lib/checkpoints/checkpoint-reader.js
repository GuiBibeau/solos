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

/** @param {RuntimeRead} observed @param {ReturnType<typeof activeIdentity>} active */
const stationObservation = (observed, active) =>
  observed.found
    ? (observed.observation ?? { observationTimedOut: /** @type {const} */ (true) })
    : replacementObservation(active);

/** @param {ReturnType<typeof activeIdentity>} active */
const replacementObservation = (active) => {
  if (!active.isReplacement) return { observationTimedOut: /** @type {const} */ (true) };
  return { latestActivityAt: active.receivedAt, taskOutcome: /** @type {const} */ ("active") };
};

/** @param {import("./schema.js").StationCheckpoint} stored @param {CurrentRead} current */
const activeIdentity = (stored, current) => ({
  isReplacement: current.found && current.binding.taskId !== stored.taskId,
  receivedAt: current.found ? current.binding.receivedAt : stored.updatedAt,
  stationRunId: current.found ? current.binding.stationRunId : stored.stationRunId,
  taskId: current.found ? current.binding.taskId : stored.taskId,
});

/** @param {import("./schema.js").StationCheckpoint} stored @param {JoinDetails} details */
const joinedResult = (stored, { observations, active, unchangedObservations }) => {
  const checkpoint = active.isReplacement
    ? stored
    : withObservedUsage(stored, observations.station);
  const statusCheckpoint = active.isReplacement
    ? { ...stored, outcome: /** @type {const} */ ("active") }
    : checkpoint;
  const rootUsage = observations.root.found ? observations.root.observation?.usage : undefined;
  const stationUsage = observations.station.found
    ? observations.station.observation?.usage
    : checkpoint.usage;
  const usage = reportUsage([rootUsage, stationUsage]);
  return {
    checkpoint,
    backoffMs: monitoringBackoffMs(unchangedObservations),
    blocker: blockerStatus(checkpoint),
    found: true,
    ...(usage !== undefined && { usage }),
    view: {
      ...stationView(statusCheckpoint, stationObservation(observations.station, active)),
      stationRunId: active.stationRunId,
      taskId: active.taskId,
    },
  };
};

const noCurrentBinding = {
  readCurrent: async () => ({ found: /** @type {const} */ (false) }),
};

/** @param {CheckpointStore} checkpoints @param {RuntimeObserver} observer @param {TaskBindings} [bindings] */
export const createCheckpointReader =
  (checkpoints, observer, bindings = noCurrentBinding) =>
  async (
    /** @type {{rootRunId: string; station: string; unchangedObservations?: number; workItem: string}} */ input,
    /** @type {import("eve/tools").SessionContext | undefined} */ ctx,
  ) => {
    const { workItem, rootRunId, station, unchangedObservations = 0 } = input;
    const result = await checkpoints.read({ rootRunId, station, workItem });
    const stored = result.checkpoint;
    if (stored === undefined || !result.found) return result;
    const current = await bindings.readCurrent({
      rootRunId,
      station,
      workItem,
    });
    const active = activeIdentity(stored, current);
    const observed =
      active.stationRunId === undefined
        ? { found: /** @type {const} */ (false) }
        : await observer.read(active.stationRunId);
    const rootObserved = await readRootObservation(observer, ctx);
    return joinedResult(stored, {
      active,
      observations: { root: rootObserved, station: observed },
      unchangedObservations,
    });
  };

/** @typedef {{read: (input: {rootRunId: string; station: string; workItem: string}) => Promise<{checkpoint?: import("./schema.js").StationCheckpoint; found: boolean}>}} CheckpointStore */
/** @typedef {{read: (id: string) => Promise<RuntimeRead>}} RuntimeObserver */
/** @typedef {{found: boolean; observation?: import("./runtime-observation.js").RuntimeObservation}} RuntimeRead */
/** @typedef {{found: false} | {binding: {receivedAt: string; stationRunId: string; taskId: string}; found: true}} CurrentRead */
/** @typedef {{readCurrent: (identity: {rootRunId: string; station: string; workItem: string}) => Promise<CurrentRead>}} TaskBindings */
/** @typedef {{active: ReturnType<typeof activeIdentity>; observations: {root: RuntimeRead; station: RuntimeRead}; unchangedObservations: number}} JoinDetails */
