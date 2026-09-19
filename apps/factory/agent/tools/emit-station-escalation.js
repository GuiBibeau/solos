// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { StationSchema } from "../lib/checkpoints/schema.js";
import { checkpointStore } from "../lib/checkpoints/store.js";

export default defineTool({
  description:
    "Atomically emit one durable, actionable escalation for a repeated station blocker. " +
    "The recorded message survives restart and repeated calls do not emit it again.",
  execute: checkpointStore.emitEscalation,
  inputSchema: z.object({
    fingerprint: z.string().min(1).max(200),
    rootRunId: z.string().min(1).max(200),
    station: StationSchema,
    workItem: z.string().min(1).max(200),
  }),
  outputSchema: z.object({
    emitted: z.boolean(),
    escalation: z.string().optional(),
    reason: z.string().optional(),
    revision: z.number().int().positive().optional(),
  }),
});
