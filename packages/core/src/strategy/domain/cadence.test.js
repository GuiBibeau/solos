// @ts-check
import { describe, expect, test } from "bun:test";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { floorRefusal, nextInstant } from "./cadence.js";
import { nextCronAt } from "./cron.js";
import { intentIdFor } from "./intent-id.js";
import { isClockKind, nextDueInstant } from "./next-instant.js";

const HOUR = Date.UTC(2026, 0, 1, 0, 30, 0);

describe("clock cadence", () => {
  test("cron 0 * * * * is the next UTC hour when local getHours throws", () => {
    const original = Date.prototype.getHours;
    Date.prototype.getHours = () => {
      throw new Error("local clock");
    };
    try {
      expect(nextCronAt("0 * * * *", HOUR)).toBe(Date.UTC(2026, 0, 1, 1, 0, 0));
      expect(nextInstant({ tickSource: { type: "clock", cron: "0 * * * *" } }, HOUR)).toBe(
        Date.UTC(2026, 0, 1, 1, 0, 0),
      );
    } finally {
      Date.prototype.getHours = original;
    }
  });

  test("a trigger is due on the same clock interval as a schedule", () => {
    const strategy = {
      kind: /** @type {const} */ ("trigger"),
      tickSource: { type: /** @type {const} */ ("clock"), every: 60_000 },
    };
    expect(isClockKind("trigger")).toBe(true);
    expect(isClockKind("rebalance")).toBe(true);
    expect(isClockKind("range")).toBe(true);
    expect(isClockKind("carry")).toBe(true);
    const rebalance = {
      kind: /** @type {const} */ ("rebalance"),
      tickSource: { type: /** @type {const} */ ("clock"), every: 60_000 },
    };
    expect(
      nextDueInstant(/** @type {import("@solos-sh/actions").Strategy} */ (rebalance), HOUR),
    ).toBe(HOUR + 60_000);
    expect(
      nextDueInstant(/** @type {import("@solos-sh/actions").Strategy} */ (strategy), HOUR),
    ).toBe(HOUR + 60_000);
  });

  test("an interval below the floor names the request and the floor", () => {
    const error = floorRefusal({ type: "clock", every: 1000 }, 10_000);
    expect(error).toBeInstanceOf(BoundsExceeded);
    expect(error?.reason).toContain("1s");
    expect(error?.remedy).toContain("10s");
    expect(error?.bound).toBe("minInterval");
  });

  test("intent ids are the strategy, the tick, and the step", () => {
    expect(intentIdFor("strategy", "tick", 1)).toBe("strategy.tick.1");
  });
});
