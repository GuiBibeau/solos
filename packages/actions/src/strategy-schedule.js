// @ts-check
import { z } from "zod";
import { ActionSchema } from "./action.js";

/** Actions a schedule Strategy emits on every tick, and an optional finite count. */
export const ScheduleParamsSchema = z
  .object({
    actions: z
      .array(ActionSchema)
      .min(1)
      .describe("Ordered Actions to emit on every tick"),
    count: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Executed ticks after which the Strategy is done. Omit to run until cancel or expiry",
      ),
  })
  .describe("Parameters for a schedule Strategy, including a finite DCA count");

/** @typedef {z.infer<typeof ScheduleParamsSchema>} ScheduleParams */
