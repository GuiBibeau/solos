// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import { PortfolioStateSchema } from "./portfolio.js";
import { AmountSchema, SignatureSchema, TimestampSchema } from "./primitives.js";

export const ViolationSchema = z.object({
  rule: z.string().min(1),
  message: z.string(),
});

/** Returned by every executor's `simulate`. `ok: false` means the action would fail or is refused. */
export const SimulationResultSchema = z.object({
  action: ActionSchema,
  ok: z.boolean(),
  unitsConsumed: AmountSchema.describe("Compute units the transaction would consume"),
  logs: z.array(z.string()),
  projectedPortfolio: PortfolioStateSchema.nullable(),
  violations: z.array(ViolationSchema),
});

/** Returned by every executor's `execute`. */
export const ExecutionResultSchema = z.object({
  action: ActionSchema,
  status: z.enum(["confirmed", "rejected", "failed"]),
  signature: SignatureSchema.nullable(),
  executedAt: TimestampSchema,
  simulated: z.boolean().describe("Whether a simulation ran before sending"),
  error: z.string().nullable(),
});

/** @typedef {z.infer<typeof ViolationSchema>} Violation */
/** @typedef {z.infer<typeof SimulationResultSchema>} SimulationResult */
/** @typedef {z.infer<typeof ExecutionResultSchema>} ExecutionResult */
