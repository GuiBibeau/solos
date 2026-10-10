// @ts-check
import { StrategyBoundsSchema, StrategyRequestStateSchema } from "@solos-sh/actions";
import { z } from "zod";

const owner = z
  .string()
  .min(1)
  .describe("Label a swarm uses to tell its registrations apart. Never authorization");

/** The document `execute_register` and `simulate_register` both take. */
export const registerInput = z.object({
  owner,
  kind: z
    .enum(["schedule", "trigger", "rebalance", "range", "carry"])
    .describe("Strategy kind: schedule, trigger, rebalance, range, or carry"),
  params: z
    .unknown()
    .describe(
      "Parameters for that kind. schedule and trigger are accepted; rebalance, range, and carry fail until their issues ship",
    ),
  tickSource: z
    .unknown()
    .describe(
      "Clock tick source with exactly one of every or cron. Stream sources are not available yet",
    ),
  bounds: StrategyBoundsSchema,
});

export const updateInput = z.object({
  id: z.string().describe("Strategy id returned by register"),
  state: StrategyRequestStateSchema.describe(
    "Requested state: active to resume, paused to pause, or done to cancel",
  ),
});

export const listInput = z.object({
  state: z
    .enum(["active", "paused", "done", "expired", "failed"])
    .optional()
    .describe("Only Strategies in this lifecycle state"),
  owner: z.string().optional().describe("Only Strategies with this owner label"),
});

export const statusInput = z.object({
  id: z.string().describe("Strategy id returned by register"),
});
