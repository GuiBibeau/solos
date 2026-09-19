// @ts-check

/**
 * @typedef {import("./schema.js").StationCheckpoint} StationCheckpoint
 * @typedef {{
 *   sessionStatus?: "running" | "waiting" | "completed" | "failed";
 *   taskOutcome?: "active" | "budget_paused" | "completed" | "failed" | "cancelled";
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
  budget_paused: "budget_paused",
  cancelled: "failed",
  completed: "completed",
  failed: "failed",
});

/** @param {StationCheckpoint} checkpoint @param {Observation} observation */
export const stationStatus = (checkpoint, observation) => {
  if (checkpoint.outcome === "budget_paused") return "budget_paused";
  if (observation.taskOutcome !== undefined) return OBSERVED_STATUS[observation.taskOutcome];
  if (observation.observationTimedOut && checkpoint.outcome === "active") return "unknown";
  if (checkpoint.outcome !== "active") return checkpoint.outcome;
  return "unknown";
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

/** A repeated blocker stays actionable until its durable escalation is acknowledged. */
/** @param {StationCheckpoint} checkpoint */
export const blockerStatus = (checkpoint) => {
  const blocker = checkpoint.blocker;
  if (blocker === undefined) return { shouldEscalate: false };
  return {
    attemptedCorrection: blocker.attemptedCorrection,
    attempts: blocker.attempts,
    escalation: blocker.escalation,
    fingerprint: blocker.fingerprint,
    lastOperation: checkpoint.latestOperation,
    shouldEscalate: blocker.attempts > 1 && blocker.escalation?.deliveredAt === undefined,
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
  if (known.length === 0) return undefined;
  const aggregate = known.find((entry) => entry?.accountingScope === "root_aggregate");
  if (aggregate !== undefined) return aggregate;
  const cachedInputTokens = known.flatMap((entry) => entry?.cachedInputTokens ?? []);
  const inputTokens = known.flatMap((entry) => entry?.inputTokens ?? []);
  const outputTokens = known.flatMap((entry) => entry?.outputTokens ?? []);
  return {
    accountingScope: /** @type {const} */ ("station"),
    ...stationBilling(known),
    ...(cachedInputTokens.length > 0 && { cachedInputTokens: sum(cachedInputTokens) }),
    ...(inputTokens.length > 0 && { inputTokens: sum(inputTokens) }),
    ...(outputTokens.length > 0 && { outputTokens: sum(outputTokens) }),
  };
};

/** @param {Array<NonNullable<StationCheckpoint["usage"]>>} entries */
const stationBilling = (entries) => {
  const billed = entries.filter((entry) => entry.billedCostUsd !== undefined);
  if (billed.length === 0 || billed.length !== entries.length) return {};
  const source = billed[0]?.billedCostSource;
  if (source === undefined || billed.some((entry) => entry.billedCostSource !== source)) return {};
  return {
    billedCostSource: source,
    billedCostUsd: sum(billed.map((entry) => entry.billedCostUsd ?? 0)),
  };
};

/** @param {number[]} values */
const sum = (values) => values.reduce((total, value) => total + value, 0);
