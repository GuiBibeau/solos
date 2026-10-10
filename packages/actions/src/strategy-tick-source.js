// @ts-check
import { z } from "zod";

/** A positive duration in milliseconds. */
export const DurationSchema = z
  .number()
  .int()
  .positive()
  .describe("Duration in milliseconds, a positive integer");

const clock = z
  .object({
    type: z.literal("clock").describe("Fire on a clock"),
    every: DurationSchema.optional().describe(
      "Milliseconds between ticks, UTC. Set this or cron, not both",
    ),
    cron: z.string().min(1).optional().describe("UTC cron expression. Set this or every, not both"),
  })
  .refine((value) => (value.every === undefined) !== (value.cron === undefined), {
    message: "a clock tick source needs exactly one of every or cron",
  });

const stream = z
  .object({
    type: z.literal("stream").describe("Fire when a signal arrives"),
    signal: z.string().optional().describe("Signal name"),
  })
  .refine(() => false, { message: "streams are not available yet" });

/** Clock or stream. A stream source fails until streams ship. A clock needs exactly one of every or cron. */
export const TickSourceSchema = z
  .discriminatedUnion("type", [clock, stream])
  .describe("What wakes the Strategy");

/** @typedef {z.infer<typeof TickSourceSchema>} TickSource */
