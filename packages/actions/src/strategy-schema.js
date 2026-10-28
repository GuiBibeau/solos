// @ts-check
import { z } from "zod";
import { TimestampSchema } from "./primitives.js";
import { StrategyBoundsSchema } from "./strategy-bounds.js";
import { CarryParamsSchema, refineCarryDraft } from "./strategy-carry.js";
import { RangeParamsSchema } from "./strategy-range.js";
import { RebalanceParamsSchema } from "./strategy-rebalance.js";
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
  updatedAt: TimestampSchema.optional().describe("Unix ms of the last Engine update"),
};

/**
 * @param {unknown} params
 * @returns {{ targets?: Readonly<Record<string, string>>; quoteMint?: string } | undefined}
 */
const rebalanceParams = (params) => {
  if (typeof params !== "object" || params === null) return undefined;
  return /** @type {{ targets?: Readonly<Record<string, string>>; quoteMint?: string }} */ (params);
};

/**
 * Mints a rebalance tick may trade. Other kinds name none here.
 * @param {{ kind: string; params: unknown }} draft
 */
const actionMints = (draft) => {
  const params = rebalanceParams(draft.params);
  if (draft.kind !== "rebalance" || params?.targets === undefined) return [];
  return [...Object.keys(params.targets), params.quoteMint ?? ""];
};

/**
 * A rebalance ticks on a clock. A non-empty allowlist must name every target and the quote.
 * @param {{ kind: string; tickSource: { type: string }; bounds: { allowedMints: readonly string[] }; params: unknown }} draft
 * @param {{ addIssue: (issue: { code: "custom"; message: string; path?: string[] }) => void }} ctx
 */
const rebalanceDraft = (draft, ctx) => {
  if (draft.kind !== "rebalance") return;
  if (draft.tickSource.type !== "clock") {
    ctx.addIssue({
      code: "custom",
      message: "rebalance requires a clock tick source",
      path: ["tickSource"],
    });
  }
  const allowed = draft.bounds.allowedMints;
  if (allowed.length === 0) return;
  const mints = [...new Set(actionMints(draft))];
  for (const mint of mints) {
    if (mint.length === 0 || allowed.includes(mint)) continue;
    ctx.addIssue({
      code: "custom",
      message: `mint ${mint} must be in bounds.allowedMints`,
      path: ["bounds", "allowedMints"],
    });
  }
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
      params: RebalanceParamsSchema,
      ...shared,
    }),
    z.object({
      kind: z.literal("range").describe("Strategy kind"),
      params: RangeParamsSchema,
      ...shared,
    }),
    z.object({
      kind: z.literal("carry").describe("Strategy kind"),
      params: CarryParamsSchema,
      ...shared,
    }),
  ])
  .superRefine(rebalanceDraft)
  .superRefine(refineCarryDraft)
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
      params: RebalanceParamsSchema,
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("range").describe("Strategy kind"),
      params: RangeParamsSchema,
      ...shared,
      ...assigned,
    }),
    z.object({
      kind: z.literal("carry").describe("Strategy kind"),
      params: CarryParamsSchema,
      ...shared,
      ...assigned,
    }),
  ])
  .superRefine(rebalanceDraft)
  .superRefine(refineCarryDraft)
  .describe("A registered Strategy");

/** @typedef {z.infer<typeof StrategySchema>} Strategy */
