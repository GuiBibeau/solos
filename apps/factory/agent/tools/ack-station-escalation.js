// @ts-check
import { defineTool } from "eve/tools";
import { z } from "zod";
import { escalationOutbox } from "../lib/checkpoints/escalation-outbox.js";
import { StationSchema } from "../lib/checkpoints/schema.js";

const InputSchema = z.object({
  escalationId: z.string().regex(/^esc_[a-f\d]{24}$/),
  fingerprint: z.string().min(1).max(200),
  rootRunId: z.string().min(1).max(200),
  station: StationSchema,
  workItem: z.string().min(1).max(200),
});
const OutputSchema = z.object({
  acknowledged: z.boolean(),
  delivery: z.enum(["delivered", "ineligible"]).optional(),
  reason: z.string().optional(),
  revision: z.number().int().positive().optional(),
});

/** @param {z.infer<typeof InputSchema>} input */
const execute = async (input) => OutputSchema.parse(await escalationOutbox.acknowledge(input));

export default defineTool({
  description:
    "Acknowledge a queued station escalation after its delivery key is present on the originating thread.",
  execute,
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
});
