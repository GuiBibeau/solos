// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { KillSwitchEngaged, StrategyNotFound } from "../domain/errors.js";
import { CapLedger, GLOBAL_KILL_SCOPE } from "../ports/cap-ledger.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";

/** @param {Record<string, unknown>} [patch] @returns {import("@solos-sh/actions").StrategyBounds} */
const bounds = (patch = {}) =>
  /** @type {import("@solos-sh/actions").StrategyBounds} */ ({
    maxNotionalPerTickUsd: "100",
    maxDailySpendUsd: "100",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
    ...patch,
  });

/** @param {string} strategyId @param {string} intentId @param {string} notionalUsd */
const req = (strategyId, intentId, notionalUsd) => ({
  strategyId,
  intentId,
  notionalUsd,
  mint: USDC,
});

/** @param {Record<string, import("@solos-sh/actions").StrategyBounds>} table @param {readonly string[]} [engineMints] */
const open = (table, engineMints = []) => {
  const clock = { now: Date.UTC(2026, 0, 1, 12) };
  const layer = memoryCapLedger({
    boundsFor: (id) => table[id],
    now: () => clock.now,
    engineMints: () => engineMints,
  });
  /** @template A @param {import("effect").Effect.Effect<A, unknown, import("../ports/cap-ledger.js").CapLedgerShape>} effect */
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provide(layer)));
  return { clock, run };
};

/** @param {unknown} error @param {string} bound */
const asBound = (error, bound) => {
  expect(error).toBeInstanceOf(BoundsExceeded);
  const typed = /** @type {BoundsExceeded} */ (error);
  expect(typed.bound).toBe(bound);
  return typed;
};

describe("memory cap ledger", () => {
  test("per-tick notional allows the cap and refuses one unit over", async () => {
    const { run } = open({
      s: bounds({ maxNotionalPerTickUsd: "1.250" }),
      zero: bounds({ maxNotionalPerTickUsd: "0", maxDailySpendUsd: "0" }),
      wide: bounds({ maxNotionalPerTickUsd: "1" }),
    });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        yield* ledger.reserve(req("s", "exact", "1.250"));
        const over = asBound(
          yield* ledger.reserve(req("s", "over", "1.251")).pipe(Effect.flip),
          "maxNotionalPerTickUsd",
        );
        expect(over).toMatchObject({ limit: "1.250", requested: "1.251", scope: "s" });
        yield* ledger.reserve(req("zero", "zero", "0"));
        const unit = `0.${"0".repeat(20)}1`;
        const tiny = asBound(
          yield* ledger.reserve(req("zero", "unit", unit)).pipe(Effect.flip),
          "maxNotionalPerTickUsd",
        );
        expect(tiny.requested).toBe(unit);
        yield* ledger.reserve(req("wide", "eq", "1.000"));
        const past = `1.${"0".repeat(20)}1`;
        const far = asBound(
          yield* ledger.reserve(req("wide", "past", past)).pipe(Effect.flip),
          "maxNotionalPerTickUsd",
        );
        expect(far.limit).toBe("1");
        expect(far.requested).toBe(past);
      }),
    );
  });

  test("daily spend allows an exact fill and refuses one unit over", async () => {
    const { run } = open({
      s: bounds({ maxDailySpendUsd: "0.30", maxNotionalPerTickUsd: "0.30" }),
      parts: bounds({ maxDailySpendUsd: "0.30", maxNotionalPerTickUsd: "0.20" }),
    });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        yield* ledger.reserve(req("s", "fill", "0.30"));
        const over = asBound(
          yield* ledger.reserve(req("s", "more", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
        expect(over).toMatchObject({ limit: "0.30", requested: "0.01", scope: "s" });
        expect(over.remedy).toContain("UTC day");
        yield* ledger.reserve(req("parts", "a", "0.10"));
        yield* ledger.reserve(req("parts", "b", "0.20"));
        asBound(
          yield* ledger.reserve(req("parts", "c", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
      }),
    );
  });

  test("a repeat reserve returns the same id and does not count twice", async () => {
    const { run } = open({ s: bounds({ maxDailySpendUsd: "5", maxNotionalPerTickUsd: "5" }) });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const first = yield* ledger.reserve(req("s", "a", "3"));
        const again = yield* ledger.reserve(req("s", "a", "99"));
        expect(again.reservationId).toBe(first.reservationId);
        yield* ledger.reserve(req("s", "b", "2"));
        asBound(yield* ledger.reserve(req("s", "c", "0.01")).pipe(Effect.flip), "maxDailySpendUsd");
      }),
    );
  });

  test("settle replaces the reserved amount and a second settle sticks", async () => {
    const caps = bounds({ maxDailySpendUsd: "5", maxNotionalPerTickUsd: "5" });
    const { run } = open({ low: caps, high: caps });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const lower = yield* ledger.reserve(req("low", "low-a", "4"));
        yield* ledger.settle(lower.reservationId, "1");
        yield* ledger.settle(lower.reservationId, "4");
        yield* ledger.reserve(req("low", "low-b", "4"));
        asBound(
          yield* ledger.reserve(req("low", "low-c", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );

        const higher = yield* ledger.reserve(req("high", "high-a", "2"));
        yield* ledger.settle(higher.reservationId, "4");
        yield* ledger.reserve(req("high", "high-b", "1"));
        asBound(
          yield* ledger.reserve(req("high", "high-c", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
        yield* ledger.release(higher.reservationId);
        asBound(
          yield* ledger.reserve(req("high", "high-d", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
      }),
    );
  });

  test("release frees an open hold and does not revive a settled or released one", async () => {
    const { run } = open({ s: bounds({ maxDailySpendUsd: "4", maxNotionalPerTickUsd: "4" }) });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("s", "a", "4"));
        asBound(
          yield* ledger.reserve(req("s", "full", "0.01")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
        yield* ledger.release(held.reservationId);
        yield* ledger.release(held.reservationId);
        yield* ledger.settle(held.reservationId, "4");
        yield* ledger.reserve(req("s", "b", "4"));
      }),
    );
  });

  test("expiresAt allows the millisecond before and refuses the instant itself", async () => {
    const at = Date.UTC(2026, 0, 2);
    const { clock, run } = open({
      s: bounds({ expiresAt: at }),
      openEnded: bounds({ expiresAt: null }),
    });
    clock.now = at - 1;
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        yield* ledger.reserve(req("s", "before", "1"));
        clock.now = at;
        const error = asBound(
          yield* ledger.reserve(req("s", "at", "1")).pipe(Effect.flip),
          "expiresAt",
        );
        expect(error).toMatchObject({ limit: String(at), requested: String(at), scope: "s" });
        yield* ledger.reserve(req("openEnded", "later", "1"));
      }),
    );
  });

  test("the mint allowlist refuses a mint outside the strategy list or the engine list", async () => {
    const listed = bounds({ allowedMints: [USDC] });
    const any = bounds({ allowedMints: [] });
    const strategyOnly = open({ listed });
    await strategyOnly.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const strategy = asBound(
          yield* ledger.reserve({ ...req("listed", "no", "1"), mint: WSOL }).pipe(Effect.flip),
          "allowedMints",
        );
        expect(strategy).toMatchObject({ requested: WSOL, limit: USDC, scope: "listed" });
        expect(strategy.reason).toContain("strategy allowlist");
        yield* ledger.reserve({ ...req("listed", "ok", "1"), mint: USDC });
      }),
    );
    const engineOnly = open({ any }, [USDC]);
    await engineOnly.run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const engine = asBound(
          yield* ledger.reserve({ ...req("any", "no", "1"), mint: WSOL }).pipe(Effect.flip),
          "allowedMints",
        );
        expect(engine.reason).toContain("Engine allowlist");
        expect(engine.limit).toBe(USDC);
        yield* ledger.reserve({ ...req("any", "ok", "1"), mint: USDC });
      }),
    );
  });

  test("a strategy kill switch blocks that strategy and a global switch blocks the rest", async () => {
    const { run } = open({ a: bounds(), b: bounds() });
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const held = yield* ledger.reserve(req("a", "held", "1"));
        yield* ledger.engage({ scope: "a", reason: "strategy halt" });
        const again = yield* ledger.reserve(req("a", "held", "9"));
        expect(again.reservationId).toBe(held.reservationId);
        const blocked = yield* ledger.reserve(req("a", "new", "1")).pipe(Effect.flip);
        expect(blocked).toBeInstanceOf(KillSwitchEngaged);
        const killed = /** @type {KillSwitchEngaged} */ (blocked);
        expect(killed.scope).toBe("a");
        expect(killed.reason).toContain("strategy halt");
        expect(killed.remedy).toContain("disengage");
        yield* ledger.settle(held.reservationId, "0.5");
        yield* ledger.reserve(req("b", "b1", "1"));
        expect(yield* ledger.status("a")).toEqual({ engaged: true, reason: "strategy halt" });
        expect(yield* ledger.status("b")).toEqual({ engaged: false, reason: null });
        expect(yield* ledger.status(GLOBAL_KILL_SCOPE)).toEqual({ engaged: false, reason: null });
        yield* ledger.engage({ scope: GLOBAL_KILL_SCOPE, reason: "all stop" });
        const globalBlock = yield* ledger.reserve(req("b", "b2", "1")).pipe(Effect.flip);
        expect(/** @type {KillSwitchEngaged} */ (globalBlock).scope).toBe(GLOBAL_KILL_SCOPE);
        yield* ledger.release((yield* ledger.reserve(req("b", "b1", "1"))).reservationId);
        yield* ledger.disengage(GLOBAL_KILL_SCOPE);
        yield* ledger.reserve(req("b", "b3", "1"));
        const still = yield* ledger.reserve(req("a", "later", "1")).pipe(Effect.flip);
        expect(/** @type {KillSwitchEngaged} */ (still).scope).toBe("a");
        yield* ledger.disengage("a");
        yield* ledger.reserve(req("a", "later", "1"));
        expect(yield* ledger.status("a")).toEqual({ engaged: false, reason: null });
      }),
    );
  });

  test("the daily window rolls at 00:00 UTC and an open hold stays on its own day", async () => {
    const { clock, run } = open({
      s: bounds({ maxDailySpendUsd: "5", maxNotionalPerTickUsd: "5" }),
    });
    clock.now = Date.UTC(2026, 0, 1, 23, 59, 59, 999);
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const yesterday = yield* ledger.reserve(req("s", "y", "5"));
        asBound(
          yield* ledger.reserve(req("s", "blocked", "1")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
        clock.now = Date.UTC(2026, 0, 2);
        const today = yield* ledger.reserve(req("s", "t", "5"));
        yield* ledger.settle(yesterday.reservationId, "1");
        asBound(
          yield* ledger.reserve(req("s", "still", "1")).pipe(Effect.flip),
          "maxDailySpendUsd",
        );
        yield* ledger.release(today.reservationId);
        yield* ledger.reserve(req("s", "freed", "5"));
      }),
    );
  });

  test("a strategy with no bounds loaded is StrategyNotFound", async () => {
    const { run } = open({});
    await run(
      Effect.gen(function* () {
        const ledger = yield* CapLedger;
        const error = yield* ledger.reserve(req("missing", "a", "1")).pipe(Effect.flip);
        expect(error).toBeInstanceOf(StrategyNotFound);
      }),
    );
  });
});
