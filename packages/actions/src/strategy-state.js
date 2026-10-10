// @ts-check
import { z } from "zod";

/** Lifecycle states. `done`, `expired`, and `failed` are terminal. */
export const STRATEGY_STATES = ["active", "paused", "done", "expired", "failed"];

/** States a Caller may request through update. `expired` and `failed` are engine-only. */
export const CALLER_STATES = ["active", "paused", "done"];

export const StrategyStateSchema = z
  .enum(STRATEGY_STATES)
  .describe(
    "Lifecycle state. Callers may request active, paused, or done. The Engine alone sets expired and failed. done, expired, and failed are terminal",
  );

/** @typedef {z.infer<typeof StrategyStateSchema>} StrategyState */

export const StrategyRequestStateSchema = z
  .enum(CALLER_STATES)
  .describe("Lifecycle state a Caller may request: active (resume), paused, or done (cancel)");

/** @typedef {z.infer<typeof StrategyRequestStateSchema>} StrategyRequestState */
