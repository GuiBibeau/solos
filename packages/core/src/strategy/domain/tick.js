// @ts-check
import { ActionSchema } from "@solos-sh/actions";
import { z } from "zod";

/** Outcomes a Tick can record. `in_flight` is a Tick whose Intent is not settled yet. */
export const TICK_OUTCOMES = [
  "missed",
  "evaluated",
  "executed",
  "failed",
  "skipped_bounds",
  "skipped_observation",
  "in_flight",
];

const intentState = z.enum(["in_flight", "settled", "failed"]);

export const TickIntentSchema = z
  .object({
    intentId: z.string().describe("Deterministic id derived from the strategy, the tick, and the step"),
    state: intentState.describe("in_flight, settled, or failed"),
    signature: z.string().nullable().optional().describe("Chain signature once the Intent was signed"),
    notionalUsd: z.string().optional().describe("USD reserved for this Intent"),
    mint: z.string().optional().describe("Mint the reservation was judged against"),
  })
  .describe("One Intent created for one Action of a Tick");

export const TickSchema = z
  .object({
    tickId: z.string().describe("Id of this Tick"),
    strategyId: z.string().describe("Strategy this Tick evaluated"),
    dueAt: z.number().int().describe("UTC millisecond the Tick was due"),
    startedAt: z.number().int().describe("UTC millisecond the Tick started"),
    finishedAt: z.number().int().nullable().describe("UTC millisecond the Tick finished, or null while in flight"),
    outcome: z.enum(TICK_OUTCOMES).describe("What the Tick recorded"),
    observations: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .describe("Exactly the Observations the kind declared"),
    actions: z.array(ActionSchema).describe("Actions evaluate returned, possibly empty"),
    intents: z.array(TickIntentSchema).describe("One Intent per executed Action, in order"),
    note: z.string().optional().describe("One sentence explaining the kind's decision"),
    reason: z.string().optional().describe("Why the Tick failed, was skipped, or settled above its hold"),
    remedy: z.string().optional().describe("What to do about reason"),
    step: z.number().int().nonnegative().optional().describe("Index of the Action that stopped the Tick"),
  })
  .describe("One evaluation of one Strategy at one instant");

/** @typedef {z.infer<typeof TickSchema>} Tick */
/** @typedef {z.infer<typeof TickIntentSchema>} TickIntent */
/** @typedef {Tick["outcome"]} TickOutcome */
