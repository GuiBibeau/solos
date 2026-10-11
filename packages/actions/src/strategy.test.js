// @ts-check
import { describe, expect, test } from "bun:test";
import {
  ScheduleParamsSchema,
  StrategyBoundsSchema,
  StrategyDraftSchema,
  StrategySchema,
  StrategyStateSchema,
  TickSourceSchema,
  TriggerParamsSchema,
} from "./index.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const ACTION = { type: "transfer_sol", to: USDC, lamports: "1" };

const bounds = () => ({
  maxNotionalPerTickUsd: "1",
  maxDailySpendUsd: "2",
  allowedMints: [],
  expiresAt: null,
  maxConsecutiveFailures: 2,
});

const schedule = () => ({
  owner: "swarm",
  kind: "schedule",
  params: { actions: [ACTION], count: 4 },
  tickSource: { type: "clock", every: 60_000 },
  bounds: bounds(),
});

/** @param {unknown} value */
const messages = (value) => {
  const parsed = StrategyDraftSchema.safeParse(value);
  if (parsed.success) return "";
  return parsed.error.issues.map((issue) => issue.message).join(" ");
};

describe("Strategy contract", () => {
  test("parses a schedule draft and a stored strategy, and describes the exported schemas", () => {
    expect(StrategyDraftSchema.parse(schedule())).toMatchObject({ kind: "schedule" });
    const stored = StrategySchema.parse({
      ...schedule(),
      schemaVersion: 1,
      id: ID,
      state: "active",
      createdAt: 0,
      expiresAt: null,
    });
    expect(stored.id).toBe(ID);
    for (const schema of [
      StrategySchema,
      StrategyBoundsSchema,
      TickSourceSchema,
      StrategyStateSchema,
      ScheduleParamsSchema,
      TriggerParamsSchema,
    ]) {
      expect((schema.description ?? "").length).toBeGreaterThan(10);
    }
  });

  test("a trigger defaults once to true and requires one threshold and a cooldown when repeating", () => {
    const trigger = {
      ...schedule(),
      kind: "trigger",
      params: { observe: { price: USDC }, condition: "above", priceUsd: "1.5", action: ACTION },
    };
    expect(StrategyDraftSchema.parse(trigger).params).toMatchObject({
      once: true,
      priceUsd: "1.5",
    });
    expect(messages({ ...trigger, params: { ...trigger.params, trailingBps: 50 } })).toContain(
      "exactly one of priceUsd or trailingBps",
    );
    expect(
      messages({
        ...trigger,
        params: { observe: { price: USDC }, condition: "below", action: ACTION, once: false },
      }),
    ).toContain("cooldown is required when once is false");
  });

  test("rebalance, range, and carry fail naming the child issue that ships them", () => {
    expect(messages({ ...schedule(), kind: "rebalance", params: {} })).toContain("#200");
    expect(messages({ ...schedule(), kind: "range", params: {} })).toContain("#201");
    expect(messages({ ...schedule(), kind: "carry", params: {} })).toContain("#202");
  });

  test("stores a plain duration and an ISO-8601 duration as milliseconds", () => {
    expect(TickSourceSchema.parse({ type: "clock", every: "1m" }).every).toBe(60_000);
    expect(TickSourceSchema.parse({ type: "clock", every: "PT1M" }).every).toBe(60_000);
  });

  test("a stream tick source fails, and a clock needs exactly one of every or cron", () => {
    expect(messages({ ...schedule(), tickSource: { type: "stream", signal: "price" } })).toContain(
      "streams are not available yet",
    );
    expect(messages({ ...schedule(), tickSource: { type: "clock" } })).toContain(
      "exactly one of every or cron",
    );
    expect(
      messages({ ...schedule(), tickSource: { type: "clock", every: 1000, cron: "0 * * * *" } }),
    ).toContain("exactly one of every or cron");
  });
});
