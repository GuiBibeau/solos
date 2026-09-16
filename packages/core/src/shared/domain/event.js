// @ts-check
import { z } from "zod";

/** Every event on the bus. Slices extend `type` with their own dotted names. */
export const BaseEventSchema = z.object({
  type: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/, "dotted lowercase, e.g. transfer.sent"),
  at: z.number().int().nonnegative().describe("Unix epoch milliseconds"),
  payload: z.unknown(),
});

/** @typedef {z.infer<typeof BaseEventSchema>} SolosEvent */

/**
 * @param {string} type
 * @param {unknown} payload
 * @returns {SolosEvent}
 */
export const makeEvent = (type, payload) => ({ type, at: Date.now(), payload });
