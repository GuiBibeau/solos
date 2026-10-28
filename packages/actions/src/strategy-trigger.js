// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import { durationMs } from "./duration.js";
import { AddressSchema, DecimalSchema } from "./primitives.js";

const COOLDOWN_MESSAGE = "cooldown must be milliseconds, 30s, 10m, 1h, or an ISO-8601 duration";

/** Milliseconds, a plain duration, or an ISO-8601 duration. Stored as milliseconds. */
const CooldownSchema = z
  .union([z.number().int().positive(), z.string().min(1)])
  .transform((value, ctx) => {
    const ms = durationMs(value);
    if (ms === undefined) {
      ctx.addIssue({ code: "custom", message: COOLDOWN_MESSAGE });
      return z.NEVER;
    }
    return ms;
  });

/** @param {{ priceUsd?: string; trailingBps?: number }} value */
const isOneThreshold = (value) =>
  (value.priceUsd === undefined) !== (value.trailingBps === undefined);

/** @param {{ once?: boolean; cooldown?: number }} value */
const hasCooldownWhenRepeating = (value) => value.once !== false || value.cooldown !== undefined;

/** @param {{ trailingBps?: number }} value */
const isTrailingInRange = (value) => {
  const bps = value.trailingBps;
  if (bps === undefined) return true;
  return Number.isSafeInteger(bps) && bps >= 50 && bps <= 9000;
};

/** A price observation and the Action a firing tick emits. */
export const TriggerParamsSchema = z
  .object({
    observe: z
      .object({
        price: AddressSchema.describe("Mint whose USD price the trigger watches"),
      })
      .describe("The observation a trigger resolves"),
    condition: z
      .enum(["above", "below"])
      .describe("strictly above or below; an exact match emits nothing"),
    priceUsd: DecimalSchema.optional().describe(
      "USD price threshold. Set this or trailingBps, not both",
    ),
    trailingBps: z
      .number()
      .optional()
      .describe(
        "Trailing distance in basis points, from 50 to 9000. Set this or priceUsd, not both",
      ),
    action: ActionSchema.describe("Action a firing tick emits"),
    once: z
      .boolean()
      .default(true)
      .describe("Fire a single time. Defaults to true. When false, cooldown is required"),
    cooldown: CooldownSchema.optional().describe(
      "Wait before the trigger can fire again, such as 10m. Required when once is false",
    ),
  })
  .refine(isOneThreshold, { message: "set exactly one of priceUsd or trailingBps" })
  .refine(hasCooldownWhenRepeating, { message: "cooldown is required when once is false" })
  .refine(isTrailingInRange, { message: "trailingBps must be an integer from 50 to 9000" })
  .describe("Parameters for a trigger Strategy");

/** @typedef {z.infer<typeof TriggerParamsSchema>} TriggerParams */
