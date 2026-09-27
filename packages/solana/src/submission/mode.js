// @ts-check
/**
 * A Submission mode: the named parameters Submission runs its fixed order with (ADR-0031).
 * Parameters switch steps on or off and tune them; they never reorder them. Every mode is a
 * preset of this one schema, never a second code path.
 */
import { z } from "zod";

const Commitment = z.enum(["processed", "confirmed", "finalized"]);

export const SubmissionModeSchema = z.strictObject({
  name: z.string().min(1).describe("How the Operator refers to this mode"),
  simulate: z
    .boolean()
    .describe("Simulate before sending, unless the Caller explicitly skips it for one Action"),
  lifetime: z.strictObject({
    recheck: z
      .boolean()
      .describe(
        "Read the block height after signing and again before sending; an expired transaction is refused as never sent",
      ),
    commitment: Commitment.describe("Commitment the block height is read at"),
    minBlocksRemaining: z
      .number()
      .int()
      .min(0)
      .max(150)
      .describe("Refuse to send with fewer blocks than this left before the lifetime ends"),
  }),
  confirmation: z.strictObject({
    commitment: z
      .enum(["confirmed", "finalized"])
      .describe("Status a signature must reach to count as landed"),
    deadlineMs: z
      .number()
      .int()
      .positive()
      .max(600_000)
      .describe("How long to wait for that status before reporting may-have-landed"),
    pollMs: z.number().int().positive().max(10_000).describe("Interval between status reads"),
  }),
});

/** @typedef {z.infer<typeof SubmissionModeSchema>} SubmissionMode */

/** The default: simulate, recheck the lifetime around everything that takes time, wait. */
export const SLOW = Object.freeze(
  SubmissionModeSchema.parse({
    name: "slow",
    simulate: true,
    lifetime: { recheck: true, commitment: "confirmed", minBlocksRemaining: 0 },
    confirmation: { commitment: "confirmed", deadlineMs: 75_000, pollMs: 400 },
  }),
);
