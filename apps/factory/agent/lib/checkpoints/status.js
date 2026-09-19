// @ts-check

/**
 * @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint
 * @typedef {{
 *   sessionStatus?: string;
 *   taskOutcome?: "active" | "completed" | "failed" | "cancelled" | "superseded";
 *   replacementActive?: boolean;
 *   observationTimedOut?: boolean;
 *   latestActivityAt?: string;
 *   cursor?: string;
 * }} Observation
 * @typedef {{
 *   cursor?: string;
 *   latestActivityAt: string;
 *   redispatch: false;
 *   status: ReturnType<typeof stationStatus>;
 * }} StationView
 */

const OBSERVED_STATUS = /** @type {const} */ ({
  active: "active",
  cancelled: "failed",
  completed: "completed",
  failed: "failed",
  superseded: "superseded",
});

/** @param {StationCheckpoint} checkpoint @param {Observation} observation */
export const stationStatus = (checkpoint, observation) => {
  if (checkpoint.outcome === "budget_paused") return "budget_paused";
  if (observation.taskOutcome === "superseded" && observation.replacementActive) return "active";
  if (observation.taskOutcome !== undefined) return OBSERVED_STATUS[observation.taskOutcome];
  if (observation.observationTimedOut) return "unknown";
  if (checkpoint.outcome !== "active") return checkpoint.outcome;
  return observation.sessionStatus === "running" ? "unknown" : "active";
};

/** Fresh activity wins over a persisted cursor, but neither can authorize redispatch. */
/** @param {StationCheckpoint} checkpoint @param {Observation} observation @returns {StationView} */
export const stationView = (checkpoint, observation) => ({
  ...((observation.cursor !== undefined || checkpoint.cursor !== undefined) && {
    cursor: observation.cursor ?? checkpoint.cursor,
  }),
  latestActivityAt: observation.latestActivityAt ?? checkpoint.updatedAt,
  redispatch: false,
  status: stationStatus(checkpoint, observation),
});

/** One escalation is emitted only after the same blocker repeats without a recorded escalation. */
/** @param {StationCheckpoint} checkpoint */
export const blockerStatus = (checkpoint) => {
  const blocker = checkpoint.blocker;
  if (blocker === undefined) return { shouldEscalate: false };
  return {
    attemptedCorrection: blocker.attemptedCorrection,
    attempts: blocker.attempts,
    fingerprint: blocker.fingerprint,
    lastOperation: checkpoint.latestOperation,
    shouldEscalate: blocker.attempts > 1 && blocker.escalationEmittedAt === undefined,
  };
};

/** Exponential monitoring delay capped at five minutes. */
/** @param {number} unchangedObservations */
export const monitoringBackoffMs = (unchangedObservations) =>
  Math.min(300_000, 5000 * 2 ** Math.min(Math.max(unchangedObservations, 0), 6));

/**
 * Root usage already aggregates completed children, so prefer it instead of summing both scopes.
 * @param {Array<StationCheckpoint["usage"]>} entries
 */
export const reportUsage = (entries) => {
  const known = entries.filter((entry) => entry !== undefined);
  const aggregate = known.find((entry) => entry?.accountingScope === "root_aggregate");
  if (aggregate !== undefined) return aggregate;
  const cachedInputTokens = known.flatMap((entry) => entry?.cachedInputTokens ?? []);
  const inputTokens = known.flatMap((entry) => entry?.inputTokens ?? []);
  const outputTokens = known.flatMap((entry) => entry?.outputTokens ?? []);
  return {
    accountingScope: /** @type {const} */ ("station"),
    ...(cachedInputTokens.length > 0 && { cachedInputTokens: sum(cachedInputTokens) }),
    ...(inputTokens.length > 0 && { inputTokens: sum(inputTokens) }),
    ...(outputTokens.length > 0 && { outputTokens: sum(outputTokens) }),
  };
};

/** @param {number[]} values */
const sum = (values) => values.reduce((total, value) => total + value, 0);
