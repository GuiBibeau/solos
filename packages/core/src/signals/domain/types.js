// @ts-check
import { z } from "zod";

/** Anything the daemon may react to from the outside world: a post, a price move, an alert. */
export const SignalSchema = z.object({
  source: z.string().describe("Feed identifier, e.g. x, pyth, custom"),
  kind: z.string().describe("Feed-specific classification"),
  content: z.string(),
  at: z.number().int().describe("Unix epoch milliseconds"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

/** @typedef {z.infer<typeof SignalSchema>} Signal */
