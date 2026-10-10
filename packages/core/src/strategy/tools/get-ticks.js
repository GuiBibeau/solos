// @ts-check
import { z } from "zod";
import { defineTool } from "../../shared/tools/define-tool.js";
import { getStrategyTicks } from "../use-cases/registry-live.js";

const OUTCOMES = /** @type {const} */ ([
  "missed",
  "evaluated",
  "executed",
  "failed",
  "skipped_bounds",
  "skipped_observation",
  "in_flight",
]);

const ticksInput = z.object({
  id: z.string().describe("Strategy id returned by register"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("How many Ticks to return, newest first. Defaults to 20 and cannot exceed 200"),
  outcome: z.enum(OUTCOMES).optional().describe("Only Ticks with this outcome"),
});

export const getTicksTool = defineTool({
  name: "solana_strategy_get_ticks",
  group: "strategy",
  tier: "read",
  stability: "beta",
  title: "Get strategy ticks",
  description:
    "Read the Ticks one Strategy has recorded, newest first. Use this to see what each interval " +
    "did, including misses, failures, and the Intents that landed.",
  input: ticksInput,
  run: (input) => getStrategyTicks(input),
});
