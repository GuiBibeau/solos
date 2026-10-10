// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";
import { AddressSchema, DecimalSchema } from "./primitives.js";
import { DurationSchema } from "./strategy-tick-source.js";

/** @param {{ priceUsd?: string; trailingBps?: number }} value */
const isOneThreshold = (value) =>
  (value.priceUsd === undefined) !== (value.trailingBps === undefined);

/** @param {{ once?: boolean; cooldown?: number }} value */
const hasCooldownWhenRepeating = (value) => value.once !== false || value.cooldown !== undefined;

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
      .int()
      .min(50)
      .max(9000)
      .optional()
      .describe(
        "Trailing distance in basis points, from 50 to 9000. Set this or priceUsd, not both",
      ),
    action: ActionSchema.describe("Action a firing tick emits"),
    once: z
      .boolean()
      .default(true)
      .describe("Fire a single time. Defaults to true. When false, cooldown is required"),
    cooldown: DurationSchema.optional().describe(
      "Milliseconds to wait before the trigger can fire again. Required when once is false",
    ),
  })
  .refine(isOneThreshold, { message: "set exactly one of priceUsd or trailingBps" })
  .refine(hasCooldownWhenRepeating, { message: "cooldown is required when once is false" })
  .describe("Parameters for a trigger Strategy");

/** @typedef {z.infer<typeof TriggerParamsSchema>} TriggerParams */
