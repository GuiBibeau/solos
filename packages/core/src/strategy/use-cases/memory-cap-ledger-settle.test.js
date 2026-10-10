// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { KillSwitchEngaged } from "../domain/errors.js";
import { CapLedger, GLOBAL_KILL_SCOPE } from "../ports/cap-ledger.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** @param {Record<string, unknown>} [patch] @returns {import("@solos-sh/actions").StrategyBounds} */
const bounds = (patch = {}) =>
  /** @type {import("@solos-sh/actions").StrategyBounds} */ ({
    maxNotionalPerTickUsd: "5",
    maxDailySpendUsd: "5",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
    ...patch,
  });

/** @param {string} strategyId @param {string} intentId @param {string} notionalUsd */
const req = (strategyId, intentId, notionalUsd) => ({
  strategyId,
  tickId: intentId,
  intentId,
  notionalUsd,
  mint: USDC,
});

/**
 * @param {Record<string, import("@solos-sh/actions").StrategyBounds>} table
 * @returns {(
 *   effect: import("effect").Effect.Effect<
 *     void,
 *     unknown,
 *     import("../ports/cap-ledger.js").CapLedgerShape
 *   >,
 * ) => Promise<void>}
 */
const run = (table) => {
  const layer = memoryCapLedger({ boundsFor: (id) => table[id] });
  return (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
};

describe("memory cap ledger settle", () => {
  test("a settle equal to the hold leaves the per-Strategy switch disengaged", async () => {
    const execute = run({ s: bounds() });
    await execute(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("s", "eq", "2"));
        yield* ledger.settle(held.reservationId, "2.00");
        expect(yield* ledger.status("s")).toEqual({ engaged: false, reason: null });
        yield* ledger.reserve(req("s", "next", "3"));
      }),
    );
  });

  test("a settle below the hold leaves the per-Strategy switch disengaged", async () => {
    const execute = run({ s: bounds() });
    await execute(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("s", "low", "4"));
        yield* ledger.settle(held.reservationId, "1");
        expect(yield* ledger.status("s")).toEqual({ engaged: false, reason: null });
        yield* ledger.reserve(req("s", "next", "4"));
      }),
    );
  });

  test("a settle above the hold records the overshoot and engages that Strategy only", async () => {
    const execute = run({ high: bounds(), other: bounds() });
    await execute(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("high", "over", "2"));
        yield* ledger.settle(held.reservationId, "3.50");
        const status = yield* ledger.status("high");
        expect(status.engaged).toBe(true);
        expect(status.reason).toContain("settle exceeded reservation");
        expect(status.reason).toContain("1.50");
        expect(yield* ledger.status(GLOBAL_KILL_SCOPE)).toEqual({ engaged: false, reason: null });
        yield* ledger.reserve(req("other", "ok", "1"));
        const blocked = yield* ledger.reserve(req("high", "next", "1")).pipe(Effect.flip);
        expect(blocked).toBeInstanceOf(KillSwitchEngaged);
        expect(/** @type {KillSwitchEngaged} */ (blocked).scope).toBe("high");
        yield* ledger.disengage("high");
        const still = yield* ledger.reserve(req("high", "too-much", "2")).pipe(Effect.flip);
        expect(still).toBeInstanceOf(BoundsExceeded);
        expect(/** @type {BoundsExceeded} */ (still).bound).toBe("maxDailySpendUsd");
        yield* ledger.reserve(req("high", "fits", "1.50"));
      }),
    );
  });
});
