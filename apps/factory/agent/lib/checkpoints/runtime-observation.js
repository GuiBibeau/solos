// @ts-check
import { z } from "zod";
import { lifecycleDelta } from "./runtime-lifecycle.js";
import { progressFromEvent, RuntimeProgressSchema } from "./runtime-progress.js";
import { RuntimeUsageSchema, usageFromEvent } from "./runtime-usage.js";

export const RuntimeObservationSchema = z.object({
  cursor: z.string().min(1).max(2000).optional(),
  lastEventId: z.string().min(1).max(200).optional(),
  latestActivityAt: z.iso.datetime(),
  pendingInput: z.enum(["other", "session_limit"]).optional(),
  pendingSessionLimitRequests: z.array(z.string().min(1).max(200)).max(20).optional(),
  revision: z.number().int().positive(),
  progress: RuntimeProgressSchema.optional(),
  seenEventIds: z.array(z.string().min(1).max(200)).max(100),
  sessionStatus: z.enum(["running", "waiting", "completed", "failed"]),
  stationRunId: z.string().min(1).max(200),
  taskOutcome: z.enum(["active", "budget_paused", "completed", "failed", "cancelled"]).optional(),
  usage: RuntimeUsageSchema.optional(),
});

const TRACKED = new Set([
  "action.result",
  "actions.requested",
  "input.requested",
  "input.resolved",
  "message.received",
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

/**
 * @param {import("eve/hooks").HookEvent} event
 * @param {string} stationRunId
 * @param {"station" | "root_aggregate"} [accountingScope]
 */
export const observationFromEvent = (event, stationRunId, accountingScope = "station") => {
  if (!TRACKED.has(event.type) || event.meta.id.length === 0) return null;
  const continuation = event.type === "session.waiting" ? event.data.continuationToken : undefined;
  return {
    ...(continuation !== undefined && { cursor: continuation }),
    eventId: event.meta.id,
    latestActivityAt: event.meta.at,
    ...lifecycleDelta(event),
    progressFact: progressFromEvent(event),
    stationRunId,
    usage: usageFromEvent(event, accountingScope),
  };
};

/** @typedef {z.infer<typeof RuntimeObservationSchema>} RuntimeObservation */
/** @typedef {z.infer<typeof RuntimeProgressSchema>} RuntimeProgress */
