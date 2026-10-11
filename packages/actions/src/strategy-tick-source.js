// @ts-check
import { z } from "zod";
import { durationMs } from "./duration.js";

/** A positive duration in milliseconds. */
export const DurationSchema = z
  .number()
  .int()
  .positive()
  .describe("Duration in milliseconds, a positive integer");

const EVERY_MESSAGE = "every must be milliseconds, 30s, 5m, 1h, or an ISO-8601 duration";

/** Milliseconds, a plain duration, or an ISO-8601 duration. Stored as milliseconds. */
const EverySchema = z
  .union([z.number().int().positive(), z.string().min(1)])
  .transform((value, ctx) => {
    const ms = durationMs(value);
    if (ms === undefined) {
      ctx.addIssue({ code: "custom", message: EVERY_MESSAGE });
      return z.NEVER;
    }
    return ms;
  });

const clock = z
  .object({
    type: z.literal("clock").describe("Fire on a clock"),
    every: EverySchema.optional().describe(
      "Milliseconds between ticks, or a duration such as 30s, 5m, 1h, or PT1M. Set this or cron, not both",
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
