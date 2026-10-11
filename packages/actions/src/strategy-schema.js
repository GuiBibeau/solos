// @ts-check
import { z } from "zod";
import { TimestampSchema } from "./primitives.js";
import { StrategyBoundsSchema } from "./strategy-bounds.js";
import { ScheduleParamsSchema } from "./strategy-schedule.js";
import { StrategyStateSchema } from "./strategy-state.js";
import { TickSourceSchema } from "./strategy-tick-source.js";
import { TriggerParamsSchema } from "./strategy-trigger.js";

/** Crockford base32, 26 characters. The Registry assigns this. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const StrategyIdSchema = z
  .string()
  .regex(ULID, "expected a ULID")
  .describe("Registry-assigned ULID");

const owner = z
  .string()
  .min(1)
  .describe("Label a swarm uses to tell its registrations apart. Never authorization");

/** @type {Record<string, string>} */
const LATER = { rebalance: "#200", range: "#201", carry: "#202" };

const shared = {
  owner,
  tickSource: TickSourceSchema,
  bounds: StrategyBoundsSchema,
};

const assigned = {
  schemaVersion: z.literal(1).describe("Strategy contract version"),
  id: StrategyIdSchema,
  state: StrategyStateSchema,
  createdAt: TimestampSchema.describe(
    "Unix epoch milliseconds when the Registry stored this Strategy",
  ),
  expiresAt: TimestampSchema.nullable().describe(
    "Unix epoch milliseconds when the Strategy expires, or null when it does not expire on a clock",
  ),
  nextDueAt: TimestampSchema.nullable()
    .optional()
    .describe("Unix epoch milliseconds of the next due Tick, or null when none is scheduled"),
  reason: z
    .string()
    .nullable()
    .optional()
    .describe("Why the Engine paused this Strategy, when it did"),
};

/** @param {string} kind */
const laterMessage = (kind) => {
  const issue = LATER[kind];
  return issue === undefined ? undefined : `${kind} strategies ship in ${issue}`;
};

/**
 * @param {{ kind: string }} value
 * @param {{ addIssue: (issue: { code: "custom"; message: string }) => void }} ctx
 */
const refuseLater = (value, ctx) => {
  const message = laterMessage(value.kind);
  if (message !== undefined) ctx.addIssue({ code: "custom", message });
};

/** What a Caller submits. The Registry assigns the id, the state, and createdAt. */
export const StrategyDraftSchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("schedule").describe("Strategy kind"),
      params: ScheduleParamsSchema,
      ...shared,
    }),
    z.object({
      kind: z.literal("trigger").describe("Strategy kind"),
      params: TriggerParamsSchema,
      ...shared,
    }),
    z.object({
      kind: z.literal("rebalance").describe("Strategy kind"),
      params: z.unknown().describe("rebalance parameters"),
      ...shared,
    }),
    z.object({
      kind: z.literal("range").describe("Strategy kind"),
      params: z.unknown().describe("range parameters"),
      ...shared,
    }),
    z.object({
      kind: z.literal("carry").describe("Strategy kind"),
      params: z.unknown().describe("carry parameters"),
      ...shared,
    }),
  ])
  .superRefine(refuseLater)
  .describe("A Strategy a Caller submits for registration");

/** @typedef {z.infer<typeof StrategyDraftSchema>} StrategyDraft */

/** A registered Strategy, including the fields the Registry assigns. */
export const StrategySchema = z
  .discriminatedUnion("kind", [
    z.object({
      kind: z.literal("schedule").describe("Strategy kind"),
      params: ScheduleParamsSchema,
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("trigger").describe("Strategy kind"),
      params: TriggerParamsSchema,
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("rebalance").describe("Strategy kind"),
      params: z.unknown().describe("rebalance parameters"),
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("range").describe("Strategy kind"),
      params: z.unknown().describe("range parameters"),
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("carry").describe("Strategy kind"),
      params: z.unknown().describe("carry parameters"),
      ...shared,
      ...assigned,
    }),
  ])
  .superRefine(refuseLater)
  .describe("A registered Strategy");

/** @typedef {z.infer<typeof StrategySchema>} Strategy */
