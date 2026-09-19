// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { StationSchema } from "../lib/checkpoints/schema.js";
import { checkpointStore } from "../lib/checkpoints/store.js";

export default defineTool({
  description:
    "Atomically claim the right to emit one escalation for a repeated station blocker. " +
    "Only the caller receiving claimed true may emit it.",
  execute: checkpointStore.claimEscalation,
  inputSchema: z.object({
    fingerprint: z.string().min(1).max(200),
    rootRunId: z.string().min(1).max(200),
    station: StationSchema,
    workItem: z.string().min(1).max(200),
  }),
  outputSchema: z.object({
    claimed: z.boolean(),
    reason: z.string().optional(),
    revision: z.number().int().positive().optional(),
  }),
});
