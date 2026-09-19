// @ts-check
import { z } from "zod";

export const RuntimeObservationSchema = z.object({
  cursor: z.string().min(1).max(2000),
  latestActivityAt: z.iso.datetime(),
  sessionStatus: z.enum(["running", "waiting", "completed", "failed"]),
  stationRunId: z.string().min(1).max(200),
  taskOutcome: z.enum(["active", "completed", "failed", "cancelled"]),
});

const TRACKED = new Set([
  "action.result",
  "actions.requested",
  "session.completed",
  "session.failed",
  "session.started",
  "session.waiting",
  "step.completed",
  "step.failed",
  "step.started",
  "turn.cancelled",
  "turn.completed",
  "turn.failed",
  "turn.started",
]);

/** @param {import("eve/hooks").HookEvent} event @param {string} stationRunId */
export const observationFromEvent = (event, stationRunId) => {
  if (!TRACKED.has(event.type)) return null;
  const status = lifecycleFor(event.type);
  const continuation = event.type === "session.waiting" ? event.data.continuationToken : undefined;
  return RuntimeObservationSchema.parse({
    cursor: continuation ?? event.meta.id,
    latestActivityAt: event.meta.at,
    stationRunId,
    ...status,
  });
};

/** @param {import("eve/hooks").HookEvent["type"]} type */
const lifecycleFor = (type) => {
  if (type === "session.completed")
    return {
      sessionStatus: /** @type {const} */ ("completed"),
      taskOutcome: /** @type {const} */ ("completed"),
    };
  if (["session.failed", "turn.failed", "step.failed"].includes(type))
    return {
      sessionStatus: /** @type {const} */ ("failed"),
      taskOutcome: /** @type {const} */ ("failed"),
    };
  if (type === "turn.cancelled")
    return {
      sessionStatus: /** @type {const} */ ("waiting"),
      taskOutcome: /** @type {const} */ ("cancelled"),
    };
  if (type === "session.waiting")
    return {
      sessionStatus: /** @type {const} */ ("waiting"),
      taskOutcome: /** @type {const} */ ("active"),
    };
  return {
    sessionStatus: /** @type {const} */ ("running"),
    taskOutcome: /** @type {const} */ ("active"),
  };
};

/** @typedef {z.infer<typeof RuntimeObservationSchema>} RuntimeObservation */
