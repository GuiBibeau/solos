// @ts-check
import { z } from "zod";

const RuntimeUsageSchema = z.object({
  accountingScope: z.literal("station"),
  billedCostSource: z.literal("eve.step.completed.usage.costUsd").optional(),
  billedCostUsd: z.number().nonnegative().optional(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
});

export const RuntimeObservationSchema = z.object({
  cursor: z.string().min(1).max(2000).optional(),
  latestActivityAt: z.iso.datetime(),
  revision: z.number().int().positive(),
  seenEventIds: z.array(z.string().min(1).max(200)).max(100),
  sessionStatus: z.enum(["running", "waiting", "completed", "failed"]),
  stationRunId: z.string().min(1).max(200),
  taskOutcome: z.enum(["active", "completed", "failed", "cancelled"]).optional(),
  usage: RuntimeUsageSchema.optional(),
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
  if (!TRACKED.has(event.type) || event.meta.id.length === 0) return null;
  const continuation = event.type === "session.waiting" ? event.data.continuationToken : undefined;
  return {
    ...(continuation !== undefined && { cursor: continuation }),
    eventId: event.meta.id,
    latestActivityAt: event.meta.at,
    sessionStatus: sessionStatusFor(event.type),
    stationRunId,
    ...taskOutcomeFor(event.type),
    ...(event.type === "step.completed" && { usage: usageFrom(event.data.usage) }),
  };
};

/** @param {import("eve/hooks").HookEvent["type"]} type */
const sessionStatusFor = (type) => {
  if (type === "session.completed") return /** @type {const} */ ("completed");
  if (["session.failed", "turn.failed", "step.failed"].includes(type))
    return /** @type {const} */ ("failed");
  if (type === "session.waiting" || type === "turn.cancelled")
    return /** @type {const} */ ("waiting");
  return /** @type {const} */ ("running");
};

/** @param {import("eve/hooks").HookEvent["type"]} type */
const taskOutcomeFor = (type) => {
  if (type === "turn.completed" || type === "session.completed")
    return { taskOutcome: /** @type {const} */ ("completed") };
  if (["session.failed", "turn.failed", "step.failed"].includes(type))
    return { taskOutcome: /** @type {const} */ ("failed") };
  if (type === "turn.cancelled") return { taskOutcome: /** @type {const} */ ("cancelled") };
  if (type === "session.waiting") return {};
  return { taskOutcome: /** @type {const} */ ("active") };
};

/** @param {Extract<import("eve/hooks").HookEvent, {type: "step.completed"}>["data"]["usage"]} usage */
const usageFrom = (usage) =>
  usage === undefined
    ? undefined
    : RuntimeUsageSchema.parse({
        accountingScope: "station",
        ...(usage.costUsd !== undefined && {
          billedCostSource: "eve.step.completed.usage.costUsd",
          billedCostUsd: usage.costUsd,
        }),
        cachedInputTokens: usage.cacheReadTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });

/** @typedef {z.infer<typeof RuntimeObservationSchema>} RuntimeObservation */
